import "./polyfill.js";

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { getNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { WalletEntrySchema, WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  PublicKey,
  UnshieldedWallet,
  createKeystore,
  type UnshieldedKeystore,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import * as Rx from "rxjs";
import type { Config } from "../config.js";

/**
 * On a freshly started local devnet the per-block fee rate is effectively zero,
 * so a wallet with no fee overhead builds an EMPTY DUST spend — which the node
 * rejects as NotNormalized (error 117).
 *
 * The failure is badly placed: a ContractDeploy is accepted, and then the very
 * next call fails, so it reads as a contract bug rather than a fee bug. Forcing
 * a small positive overhead makes the transaction normalize.
 */
export const ADDITIONAL_FEE_OVERHEAD = 300_000_000_000_000n;
const FEE_BLOCKS_MARGIN = 5;

export interface WalletContext {
  facade: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  keystore: UnshieldedKeystore;
}

export function deriveKeys(seedHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) {
    throw new Error(`Invalid seed: expected 64 hex characters, got ${seedHex.length}`);
  }
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, "hex"));
  if (hd.type !== "seedOk") throw new Error("Invalid seed: HD wallet derivation failed");

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error("Key derivation failed");
  hd.hdWallet.clear();

  return {
    zswap: derived.keys[Roles.Zswap],
    nightExternal: derived.keys[Roles.NightExternal],
    dust: derived.keys[Roles.Dust],
  };
}

/**
 * Build and START a wallet facade.
 *
 * Lifecycle is init -> start -> wait for isSynced -> work -> stop. Skipping
 * start() leaves isSynced false forever, and reading balances before sync
 * completes silently undercounts.
 */
export async function buildWallet(
  seedHex: string,
  config: Config,
  opts: { feeOverhead?: bigint } = {},
): Promise<WalletContext> {
  const keys = deriveKeys(seedHex);
  const networkId = getNetworkId();

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys.zswap);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys.dust);
  const keystore = createKeystore(keys.nightExternal, networkId);

  const configuration = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: config.MIDNIGHT_INDEXER_URL,
      indexerWsUrl: config.MIDNIGHT_INDEXER_WS,
    },
    // Must be ws:// — the submission relay rejects an http:// scheme here.
    relayURL: new URL(config.MIDNIGHT_NODE_URL.replace(/^http/, "ws")),
    // Required, and must be a URL object rather than a string.
    provingServerUrl: new URL(config.MIDNIGHT_PROOF_SERVER_URL),
    costParameters: {
      additionalFeeOverhead: opts.feeOverhead ?? ADDITIONAL_FEE_OVERHEAD,
      feeBlocksMargin: FEE_BLOCKS_MARGIN,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  const facade = await WalletFacade.init({
    configuration,
    shielded: (cfg: never) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg: never) =>
      UnshieldedWallet({
        ...(cfg as object),
        txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
      } as never).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg: never) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        // Omitting these initial parameters is a runtime error, not a warning.
        ledger.LedgerParameters.initialParameters().dust,
      ),
  } as never);

  await facade.start(shieldedSecretKeys, dustSecretKey);
  return { facade, shieldedSecretKeys, dustSecretKey, keystore };
}

/** Block until the wallet has finished its initial sync. */
export async function waitForSync(facade: WalletFacade, timeoutMs = 120_000) {
  return Rx.firstValueFrom(
    facade.state().pipe(
      Rx.filter((s: { isSynced: boolean }) => s.isSynced),
      Rx.timeout({
        first: timeoutMs,
        with: () =>
          Rx.throwError(
            () =>
              new Error(
                `Wallet did not sync within ${timeoutMs}ms. Is the node and indexer reachable?`,
              ),
          ),
      }),
    ),
  );
}

export const nightBalanceOf = (state: any): bigint =>
  BigInt(state?.unshielded?.balances?.[ledger.nativeToken().raw] ?? 0n);

/**
 * Keep the latest wallet state in a holder so /chain/health can report real
 * values without blocking on an observable.
 *
 * Returns an unsubscribe function; the caller must call it on shutdown or the
 * subscription keeps the process alive.
 */
export interface WalletSnapshot {
  synced: boolean;
  nightBalance: bigint | null;
  dustBalance: bigint | null;
  error?: string;
}

export function trackWalletState(facade: WalletFacade): {
  read: () => WalletSnapshot;
  stop: () => void;
} {
  let snapshot: WalletSnapshot = { synced: false, nightBalance: null, dustBalance: null };

  const sub = facade.state().subscribe({
    next: (s: any) => {
      let dust: bigint | null = null;
      try {
        dust = s?.dust?.balance ? BigInt(s.dust.balance(new Date())) : null;
      } catch {
        dust = null;
      }
      snapshot = {
        synced: Boolean(s?.isSynced),
        nightBalance: nightBalanceOf(s),
        dustBalance: dust,
      };
    },
    error: (e: unknown) => {
      snapshot = {
        ...snapshot,
        synced: false,
        error: e instanceof Error ? e.message : String(e),
      };
    },
  });

  return { read: () => snapshot, stop: () => sub.unsubscribe() };
}
