/** Read deployed contract state straight from the indexer. */
import { readFileSync } from "node:fs";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { loadConfig } from "../config.js";
import { ledger, pureCircuits } from "../chain/contract.js";
import { derivePlatformOwnerSecretKey, deriveIssuerSecretKey, GENESIS_SEED } from "../keys.js";

const config = loadConfig();
setNetworkId(config.MIDNIGHT_NETWORK_ID);

const dep = JSON.parse(
  readFileSync(`../deployments/${config.MIDNIGHT_NETWORK_ID}.json`, "utf8"),
);
const provider = indexerPublicDataProvider(config.MIDNIGHT_INDEXER_URL, config.MIDNIGHT_INDEXER_WS);
const state = await provider.queryContractState(dep.contractAddress);
if (!state) throw new Error("contract state not found on chain");

const l: any = ledger(state.data);
const seed = config.MIDNIGHT_WALLET_SEED ?? GENESIS_SEED;
const expectedOwner = Buffer.from(pureCircuits.publicKey(derivePlatformOwnerSecretKey(seed))).toString("hex");
const expectedIssuer = Buffer.from(pureCircuits.publicKey(deriveIssuerSecretKey(seed, "demo-university"))).toString("hex");
const actualOwner = Buffer.from(l.platformOwner).toString("hex");

console.log("contract address :", dep.contractAddress);
console.log("platformOwner    :", actualOwner);
console.log("  matches derived:", actualOwner === expectedOwner);
console.log("issuers.size()   :", l.issuers.size().toString());
console.log("  demo issuer authorized:", l.issuers.member(pureCircuits.publicKey(deriveIssuerSecretKey(seed, "demo-university"))));
console.log("credentials      :", l.credentials.size().toString());
console.log("revoked          :", l.revoked.size().toString());
process.exit(actualOwner === expectedOwner && l.issuers.size() === 1n ? 0 : 1);
