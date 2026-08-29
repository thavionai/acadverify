import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type { Config } from "../config.js";
import type { Logger } from "../logging.js";
import { AppError } from "../http/errors.js";
import { bytes32ToHex, credentialIdToBytes, hexToBytes32 } from "../codec.js";
import { deriveIssuerSecretKey, derivePlatformOwnerSecretKey, GENESIS_SEED } from "../keys.js";
import { Vault } from "../vault/store.js";
import { loadCompiledContract, ledger, pureCircuits } from "./contract.js";
import { CircuitAssertError, proveLocally } from "./localProve.js";
import { createProviders, PRIVATE_STATE_ID, type Providers } from "./providers.js";
import { TxQueue } from "./txQueue.js";
import {
  buildWallet,
  trackWalletState,
  waitForSync,
  type WalletContext,
} from "./wallet.js";
import { emptyWorkingSet, type AcadPrivateState, type CredentialDataWitness } from "./witnesses.js";
import type {
  ChainAdapter,
  CredentialFields,
  HealthResult,
  IssueResult,
  ProveResult,
  RevokeResult,
  StateResult,
} from "./ports.js";

const toWitnessFields = (f: CredentialFields): CredentialDataWitness => ({
  studentId: hexToBytes32(f.studentId, "studentId"),
  issuerPk: hexToBytes32(f.issuerPk, "issuerPk"),
  institutionId: hexToBytes32(f.institutionId, "institutionId"),
  degreeCode: BigInt(f.degreeCode),
  graduationYear: BigInt(f.graduationYear),
  gpaTimes100: BigInt(f.gpaTimes100),
});

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  return [await fn(), Date.now() - t0];
}

/**
 * Wrap a `callTx.*` invocation (build -> prove -> balance -> submit) so any
 * failure in that pipeline surfaces as the named, honest `PROOF_SERVICE_UNAVAILABLE`
 * rather than falling through to a generic `500 INTERNAL`.
 *
 * This was a real gap, not a design choice: previously nothing here caught the
 * raw SDK/network error a `callTx.*` call throws when the proof server is
 * unreachable or a proving/submission step fails, so it propagated uncaught to
 * the Express error middleware as an unnamed 500. That never accused a
 * credential of being invalid (issue/revoke/authorize have no credential
 * verdict to corrupt), but it also never told the caller — or anyone reading
 * logs — what actually broke, which is the bar `chain-service-engineer.md`
 * sets: "proof-server timeout is PROOF_SERVICE_UNAVAILABLE... surface honest
 * errors."
 *
 * Any AppError thrown from inside `fn` (there shouldn't be one at these call
 * sites today, but a future caller might add one) passes through unchanged —
 * this only reclassifies UNEXPECTED failures, never overrides an intentional one.
 */
export async function submitTx<T>(logger: Logger, op: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    const message = e instanceof Error ? e.message : String(e);
    logger.error({ op, cause: message }, "callTx failed");
    throw new AppError("PROOF_SERVICE_UNAVAILABLE");
  }
}

class LiveChainAdapter implements ChainAdapter {
  readonly mode = "live" as const;
  private readonly queue = new TxQueue();

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly wallet: WalletContext,
    private readonly providers: Providers,
    private readonly contract: any,
    private readonly contractAddress: string,
    private readonly vault: Vault,
    private readonly ownerSk: Uint8Array,
    private readonly wallet_: { read: () => import("./wallet.js").WalletSnapshot; stop: () => void },
  ) {}

  /** Swap the witness working set. Always called inside the queue. */
  private async setWorkingSet(ps: AcadPrivateState): Promise<void> {
    await this.providers.privateStateProvider.set(PRIVATE_STATE_ID as never, ps as never);
  }

  private async liveState(): Promise<{ state: unknown; blockHeight: number | null }> {
    try {
      const s = await this.providers.publicDataProvider.queryContractState(
        this.contractAddress as never,
      );
      if (!s) throw new AppError("CHAIN_UNAVAILABLE", "Contract state not found on chain.");
      return { state: (s as any).data, blockHeight: (s as any).blockHeight ?? null };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("CHAIN_UNAVAILABLE");
    }
  }

  /** Poll until the indexer reflects a just-submitted write. */
  private async waitForState(
    predicate: (l: any) => boolean,
    timeoutMs = 30_000,
  ): Promise<number | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { state, blockHeight } = await this.liveState();
      if (predicate(ledger(state as never))) return blockHeight;
      if (Date.now() > deadline) {
        throw new AppError("CHAIN_UNAVAILABLE", "Timed out waiting for the indexer to catch up.");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async health(): Promise<HealthResult> {
    const probe = async (url: string, init?: RequestInit) => {
      const t0 = Date.now();
      try {
        await fetch(url, { signal: AbortSignal.timeout(5000), ...init });
        return { ok: true, latencyMs: Date.now() - t0 };
      } catch (e) {
        return { ok: false, latencyMs: null, error: e instanceof Error ? e.message : String(e) };
      }
    };
    const [node, indexer, proofServer] = await Promise.all([
      probe(`${this.config.MIDNIGHT_NODE_URL}/health`),
      probe(this.config.MIDNIGHT_INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ block { height } }" }),
      }),
      probe(`${this.config.MIDNIGHT_PROOF_SERVER_URL}/health`),
    ]);
    // Real wallet state, not a hardcoded optimistic guess. SRE alarms on this
    // endpoint, so reporting synced:true unconditionally would hide exactly the
    // failure it exists to catch: a desynced wallet or exhausted DUST, either of
    // which makes every issuance fail while the service still looks healthy.
    const w = this.wallet_.read();
    return {
      ok: node.ok && indexer.ok && proofServer.ok && w.synced,
      mode: this.mode,
      networkId: this.config.MIDNIGHT_NETWORK_ID,
      contractAddress: this.contractAddress,
      services: { node, indexer, proofServer },
      wallet: {
        synced: w.synced,
        dustAvailable: w.dustBalance === null ? null : w.dustBalance.toString(),
      },
    };
  }

  async authorizeIssuer(issuerPk: string): Promise<{ txId: string; blockHeight: number | null }> {
    return this.queue.run(async () => {
      await this.setWorkingSet(emptyWorkingSet(this.ownerSk));
      const pk = hexToBytes32(issuerPk, "issuerPk");
      const res = await submitTx<any>(this.logger, "authorizeIssuer", () =>
        this.contract.callTx.authorizeIssuer(pk),
      );
      const blockHeight = await this.waitForState((l) => l.issuers.member(pk));
      return { txId: res.public.txId, blockHeight };
    });
  }

  async issue(credentialId: string, fields: CredentialFields): Promise<IssueResult> {
    return this.queue.run(async () => {
      const idBytes = credentialIdToBytes(credentialId);
      const { state } = await this.liveState();
      if ((ledger(state as never) as any).credentials.member(idBytes)) {
        throw new AppError("DUPLICATE_CREDENTIAL", `Credential ${credentialId} already exists.`);
      }

      // Fresh random blinding factor. Never reused, never returned, never logged.
      const salt = Uint8Array.from(randomBytes(32));
      const witnessFields = toWitnessFields(fields);
      const issuerSk = deriveIssuerSecretKey(
        this.config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED,
        "demo-university",
      );

      const ps: AcadPrivateState = { secretKey: issuerSk, fields: witnessFields, salt };
      await this.setWorkingSet(ps);

      const [res, provingMs] = await timed<any>(() =>
        submitTx(this.logger, "issue", () => this.contract.callTx.issue(idBytes)),
      );
      const blockHeight = await this.waitForState((l) => l.credentials.member(idBytes));

      await this.vault.put(credentialId.trim().toUpperCase(), { fields: witnessFields, salt });

      // Self-check: prove the credential we just issued. If the witness binding
      // were wrong, this catches it now rather than at verification time.
      const { state: after } = await this.liveState();
      try {
        proveLocally(this.contractAddress, after, ps, idBytes, false);
      } catch (e) {
        this.logger.error({ credentialId }, "issued credential is not provable");
        throw new AppError(
          "INTERNAL",
          "Credential was written on-chain but is not provable. This is a bug, not a bad credential.",
        );
      }

      const commitment = (ledger(after as never) as any).credentials.lookup(idBytes);
      return {
        credentialId,
        txId: res.public.txId,
        blockHeight,
        commitment: bytes32ToHex(commitment),
        contractAddress: this.contractAddress,
        networkId: this.config.MIDNIGHT_NETWORK_ID,
        provingMs,
        submittedAt: new Date().toISOString(),
      };
    });
  }

  async revoke(credentialId: string): Promise<RevokeResult> {
    return this.queue.run(async () => {
      const idBytes = credentialIdToBytes(credentialId);
      const { state } = await this.liveState();
      const l: any = ledger(state as never);
      if (!l.credentials.member(idBytes)) throw AppError.notFound();
      if (l.revoked.member(idBytes)) {
        throw new AppError("CREDENTIAL_ALREADY_REVOKED", "This credential was already revoked.");
      }

      const issuerSk = deriveIssuerSecretKey(
        this.config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED,
        "demo-university",
      );
      await this.setWorkingSet(emptyWorkingSet(issuerSk));

      const res = await submitTx<any>(this.logger, "revokeCredential", () =>
        this.contract.callTx.revokeCredential(idBytes),
      );
      const blockHeight = await this.waitForState((x) => x.revoked.member(idBytes));
      return { credentialId, txId: res.public.txId, blockHeight, revokedAt: new Date().toISOString() };
    });
  }

  async prove(credentialId: string, disclose: string[]): Promise<ProveResult> {
    const key = credentialId.trim().toUpperCase();
    const idBytes = credentialIdToBytes(credentialId);
    const revealGpa = disclose.includes("gpa");

    const { state, blockHeight } = await this.liveState();
    const l: any = ledger(state as never);
    if (!l.credentials.member(idBytes)) throw AppError.notFound();

    const entry = await this.vault.get(key);
    // OUR failure, never the credential's. Without this distinction a wiped
    // volume would make every real degree on the platform render as forged.
    if (!entry) throw new AppError("PROOF_MATERIAL_UNAVAILABLE");

    const issuerSk = deriveIssuerSecretKey(
      this.config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED,
      "demo-university",
    );
    const ps: AcadPrivateState = { secretKey: issuerSk, fields: entry.fields, salt: entry.salt };

    const t0 = Date.now();
    let status: ProveResult["status"] = "VALID";
    let disclosed: ProveResult["disclosed"] = null;
    try {
      const claim = proveLocally(this.contractAddress, state, ps, idBytes, revealGpa);
      disclosed = {
        institutionId: bytes32ToHex(claim.institutionId),
        degreeCode: Number(claim.degreeCode),
        graduationYear: Number(claim.graduationYear),
        // Driven by CONSENT, never by the value: a real 0.00 GPA must stay
        // distinguishable from a withheld one.
        gpaTimes100: revealGpa ? Number(claim.gpaTimes100) : null,
      };
    } catch (e) {
      if (!(e instanceof CircuitAssertError)) throw e;
      status = e.reason === "credential revoked" ? "REVOKED" : "INVALID_PROOF";
    }
    const provingMs = Date.now() - t0;

    return {
      status,
      disclosed,
      withheld: ["studentId", ...(revealGpa ? [] : ["gpa"])],
      evidence: {
        contractAddress: this.contractAddress,
        networkId: this.config.MIDNIGHT_NETWORK_ID,
        commitment: l.credentials.member(idBytes)
          ? bytes32ToHex(l.credentials.lookup(idBytes))
          : null,
        issuanceTxId: null,
        stateBlockHeight: blockHeight,
        checkedAt: new Date().toISOString(),
      },
      proof: { level: "circuit-checked", verified: status === "VALID", provingMs },
    };
  }

  async state(credentialId: string): Promise<StateResult> {
    const idBytes = credentialIdToBytes(credentialId);
    const { state, blockHeight } = await this.liveState();
    const l: any = ledger(state as never);
    const exists = l.credentials.member(idBytes);
    if (!exists) throw AppError.notFound();
    return {
      credentialId,
      exists,
      revoked: l.revoked.member(idBytes),
      commitment: bytes32ToHex(l.credentials.lookup(idBytes)),
      contractAddress: this.contractAddress,
      networkId: this.config.MIDNIGHT_NETWORK_ID,
      blockHeight,
    };
  }

  /** Demo only: corrupt the stored witness so the forgery beat is a live click. */
  async tamper(credentialId: string): Promise<{ tampered: boolean }> {
    const key = credentialId.trim().toUpperCase();
    const entry = await this.vault.get(key);
    if (!entry) throw AppError.notFound();
    await this.vault.put(key, {
      ...entry,
      fields: { ...entry.fields, gpaTimes100: entry.fields.gpaTimes100 + 1n },
    });
    return { tampered: true };
  }

  async close(): Promise<void> {
    // Unsubscribe first: a live subscription keeps the process alive.
    this.wallet_.stop();
    await this.vault.close();
    await this.wallet.facade.stop();
  }
}

export async function createLiveAdapter(config: Config, logger: Logger): Promise<ChainAdapter> {
  // Must happen before any provider is constructed.
  setNetworkId(config.MIDNIGHT_NETWORK_ID);

  const address =
    config.CONTRACT_ADDRESS ??
    (() => {
      try {
        return JSON.parse(
          readFileSync(`../deployments/${config.MIDNIGHT_NETWORK_ID}.json`, "utf8"),
        ).contractAddress as string;
      } catch {
        return undefined;
      }
    })();

  if (!address) {
    throw new AppError(
      "NOT_CONFIGURED",
      `No contract address. Run 'npm run deploy' or set CONTRACT_ADDRESS.`,
    );
  }

  const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
  const ownerSk = derivePlatformOwnerSecretKey(seed);

  const wallet = await buildWallet(seed, config);
  await waitForSync(wallet.facade);
  const walletTracker = trackWalletState(wallet.facade);
  const providers = await createProviders(config, wallet);

  const contract = await findDeployedContract(providers as never, {
    contractAddress: address as never,
    compiledContract: loadCompiledContract(config.MIDNIGHT_ZK_CONFIG_PATH),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: emptyWorkingSet(ownerSk),
  } as never);

  logger.info({ contractAddress: address }, "live adapter ready");

  return new LiveChainAdapter(
    config,
    logger,
    wallet,
    providers,
    contract,
    address,
    new Vault(config.MIDNIGHT_PRIVATE_STATE_PATH + "/vault"),
    ownerSk,
    walletTracker,
  );
}
