/**
 * Live adapter — wires the real Midnight stack (Phase 3/4).
 *
 * Deliberately a placeholder rather than a half-wired implementation: a partially
 * working live adapter that silently degrades is far more dangerous here than one
 * that refuses to start, because its failures would surface as credential
 * verdicts. Until this is complete, CHAIN_MODE=live fails loudly at boot.
 */
import type { Config } from "../config.js";
import type { Logger } from "../logging.js";
import type { ChainAdapter } from "./ports.js";

export async function createLiveAdapter(_config: Config, _logger: Logger): Promise<ChainAdapter> {
  throw new Error(
    "CHAIN_MODE=live is not implemented yet (Phase 3/4). Run with CHAIN_MODE=mock.\n" +
      "The mock serves the identical HTTP contract, so nothing downstream needs to change.",
  );
}
