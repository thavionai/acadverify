import "./polyfill.js";

import type { ProvableCircuitId } from "@midnight-ntwrk/compact-js";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type { MidnightProvider, WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import * as Rx from "rxjs";
import type { Config } from "../config.js";
import type { WalletContext } from "./wallet.js";

export const PRIVATE_STATE_ID = "acadverify";

/**
 * Private state is encrypted at rest with this password. Fine for a local
 * devnet; any other network must supply a real secret.
 * Complexity requirement: 3 of 4 of upper/lower/digit/special.
 */
const LOCAL_PRIVATE_STATE_PASSWORD = "AcadVerify-Dev-Pa55word!";

/**
 * walletProvider and midnightProvider are intentionally the SAME object: one
 * wallet both balances and submits.
 */
async function createWalletProvider(
  wallet: WalletContext,
): Promise<WalletProvider & MidnightProvider> {
  const { facade, shieldedSecretKeys, dustSecretKey } = wallet;

  // Capture a synced state: getCoinPublicKey/getEncryptionPublicKey are
  // synchronous, so the state must already be available when they are called.
  const state: any = await Rx.firstValueFrom(
    facade.state().pipe(Rx.filter((s: any) => s.isSynced)),
  );

  return {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await facade.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return facade.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => facade.submitTransaction(tx),
  } as unknown as WalletProvider & MidnightProvider;
}

/**
 * Construct all six providers.
 *
 * Called inside a function, never at module scope: setNetworkId must run before
 * any provider is built, and a stray top-level construction reorders that into a
 * network mismatch that surfaces three layers away from its cause.
 */
export async function createProviders(config: Config, wallet: WalletContext) {
  const walletProvider = await createWalletProvider(wallet);
  const zkConfigProvider = new NodeZkConfigProvider<ProvableCircuitId<never>>(
    config.MIDNIGHT_ZK_CONFIG_PATH,
  );

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: config.MIDNIGHT_PRIVATE_STATE_PATH,
      privateStoragePasswordProvider: () => LOCAL_PRIVATE_STATE_PASSWORD,
      accountId: wallet.keystore.getBech32Address().toString(),
    } as never),
    publicDataProvider: indexerPublicDataProvider(
      config.MIDNIGHT_INDEXER_URL,
      config.MIDNIGHT_INDEXER_WS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.MIDNIGHT_PROOF_SERVER_URL, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

export type Providers = Awaited<ReturnType<typeof createProviders>>;
