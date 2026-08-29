/**
 * Onboard an additional university onto the already-deployed contract, without
 * redeploying it.
 *
 * deploy.ts authorizes exactly one hardcoded "demo-university" issuer as part
 * of the initial deploy. This script is the standalone path for every
 * institution after that first one — the same underlying capability the
 * running service exposes at POST /chain/authorize-issuer, available here as a
 * CLI for when the service isn't running (e.g. bootstrapping a fresh deploy) or
 * for scripting onboarding of several institutions at once.
 *
 * Usage:
 *   npm run authorize -- <institutionId>
 *
 * <institutionId> is an arbitrary stable slug (e.g. "north-valley-university").
 * The issuer secret key is DERIVED from it plus the wallet seed (see keys.ts) —
 * nothing is generated or stored here, so re-running with the same
 * institutionId is safe and idempotent from the caller's side (the contract
 * itself will simply re-insert into the `issuers` Set, a no-op if already
 * present).
 */
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { loadConfig } from "../config.js";
import { loadCompiledContract, pureCircuits } from "../chain/contract.js";
import { createProviders, PRIVATE_STATE_ID } from "../chain/providers.js";
import { buildWallet, waitForSync } from "../chain/wallet.js";
import { emptyWorkingSet } from "../chain/witnesses.js";
import { deriveIssuerSecretKey, derivePlatformOwnerSecretKey, GENESIS_SEED } from "../keys.js";

const institutionId = process.argv[2];
if (!institutionId) {
  console.error("Usage: npm run authorize -- <institutionId>");
  process.exit(1);
}

const config = loadConfig();
setNetworkId(config.MIDNIGHT_NETWORK_ID);

const dep = JSON.parse(
  readFileSync(resolve(`../deployments/${config.MIDNIGHT_NETWORK_ID}.json`), "utf8"),
);

const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
const ownerSk = derivePlatformOwnerSecretKey(seed);
const issuerSk = deriveIssuerSecretKey(seed, institutionId);
const issuerPk = pureCircuits.publicKey(issuerSk);

const wallet = await buildWallet(seed, config);
try {
  await waitForSync(wallet.facade);
  const providers = await createProviders(config, wallet);

  // The platform owner authorizes issuers, so the working set here must be the
  // OWNER's key, not the new issuer's — authorizeIssuer's own assert checks the
  // caller against platformOwner.
  await providers.privateStateProvider.set(
    PRIVATE_STATE_ID as never,
    emptyWorkingSet(ownerSk) as never,
  );

  const contract: any = await findDeployedContract(providers as never, {
    contractAddress: dep.contractAddress,
    compiledContract: loadCompiledContract(config.MIDNIGHT_ZK_CONFIG_PATH),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: emptyWorkingSet(ownerSk),
  } as never);

  console.log(`authorizing "${institutionId}"…`);
  const res = await contract.callTx.authorizeIssuer(issuerPk);

  console.log("issuerPk:", Buffer.from(issuerPk).toString("hex"));
  console.log("txId:", res.public.txId);
  console.log(
    "\nGive this institutionId + issuerPk to whoever operates the backend for",
    institutionId,
    "— it is what future `issue` calls on their behalf must carry as",
    "CredentialData.issuerPk.",
  );
} finally {
  await wallet.facade.stop();
}
