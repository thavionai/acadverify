import { assertNodeVersion, loadConfig } from "./config.js";
import { createLogger } from "./logging.js";
import { createApp } from "./http/app.js";
import { MockChainAdapter } from "./chain/mock.js";
import type { ChainAdapter } from "./chain/ports.js";

async function main(): Promise<void> {
  assertNodeVersion();

  const config = loadConfig();
  const logger = createLogger(config);

  let adapter: ChainAdapter;
  if (config.CHAIN_MODE === "mock") {
    adapter = new MockChainAdapter(config.MIDNIGHT_NETWORK_ID);
  } else {
    const { createLiveAdapter } = await import("./chain/live.js");
    adapter = await createLiveAdapter(config, logger);
  }

  const app = createApp(adapter, config, logger);
  const server = app.listen(config.CHAIN_SERVICE_PORT, () => {
    logger.info(
      {
        mode: config.CHAIN_MODE,
        port: config.CHAIN_SERVICE_PORT,
        networkId: config.MIDNIGHT_NETWORK_ID,
        debugEndpoints: config.ALLOW_DEBUG_ENDPOINTS,
      },
      "chain-service listening",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close();
    await adapter.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
