/**
 * Deploy the contract and authorize the demo issuer.
 *
 * Writes midnight/deployments/<networkId>.json, which is the single source of
 * truth for CONTRACT_ADDRESS across the team.
 *
 * No separate "bootstrap wallet" step exists on purpose: the local devnet's
 * genesis wallet (seed GENESIS_SEED, below) comes pre-funded with NIGHT and
 * DUST by the dev chain-spec, verified directly against this devnet — so there
 * is nothing to fund before deploying here. A Preview deploy is different: it
 * needs a wallet funded with real tDUST from the Preview faucet first, which is
 * the blockchain-engineer's step (see README.md), not something this script
 * does — buildWallet() below works unchanged for either network, only
 * MIDNIGHT_WALLET_SEED / MIDNIGHT_NETWORK_ID need to point at a funded Preview
 * seed instead of the genesis one.
 *
 * To onboard an institution AFTER this initial deploy, use
 * `npm run authorize -- <institutionId>` (authorize-issuer.ts) rather than
 * re-running this script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { loadConfig } from "../config.js";
import { loadCompiledContract, pureCircuits } from "../chain/contract.js";
import { createProviders, PRIVATE_STATE_ID } from "../chain/providers.js";
import { buildWallet, waitForSync } from "../chain/wallet.js";
import { emptyWorkingSet } from "../chain/witnesses.js";
import { deriveIssuerSecretKey, derivePlatformOwnerSecretKey, GENESIS_SEED } from "../keys.js";

const config = loadConfig();
setNetworkId(config.MIDNIGHT_NETWORK_ID);

const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
const ownerSk = derivePlatformOwnerSecretKey(seed);
const issuerSk = deriveIssuerSecretKey(seed, "demo-university");

const wallet = await buildWallet(seed, config);
try {
  await waitForSync(wallet.facade);
  const providers = await createProviders(config, wallet);

  console.log("deploying contract…");
  const deployed: any = await deployContract(providers as never, {
    compiledContract: loadCompiledContract(config.MIDNIGHT_ZK_CONFIG_PATH),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: emptyWorkingSet(ownerSk),
  } as never);

  const address: string = deployed.deployTxData.public.contractAddress;
  console.log("contract address:", address);

  console.log("authorizing demo issuer…");
  const issuerPk = pureCircuits.publicKey(issuerSk);
  await deployed.callTx.authorizeIssuer(issuerPk);

  const out = resolve(`../deployments/${config.MIDNIGHT_NETWORK_ID}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        networkId: config.MIDNIGHT_NETWORK_ID,
        contractAddress: address,
        deployTxId: deployed.deployTxData.public.txId,
        blockHeight: deployed.deployTxData.public.blockHeight,
        platformOwnerPk: Buffer.from(pureCircuits.publicKey(ownerSk)).toString("hex"),
        demoIssuerPk: Buffer.from(issuerPk).toString("hex"),
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log("wrote", out);
} finally {
  await wallet.facade.stop();
}
