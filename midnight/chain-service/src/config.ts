/**
 * The ONLY module that reads process.env. Everything else takes config as input,
 * so tests can construct a config without touching the environment.
 */
import { z } from "zod";

const EnvSchema = z.object({
  CHAIN_MODE: z.enum(["mock", "live"]).default("mock"),
  CHAIN_SERVICE_PORT: z.coerce.number().int().positive().default(8090),

  MIDNIGHT_NETWORK_ID: z.enum(["undeployed", "preview", "preprod"]).default("undeployed"),
  MIDNIGHT_NODE_URL: z.string().default("http://127.0.0.1:9944"),
  MIDNIGHT_INDEXER_URL: z.string().default("http://127.0.0.1:8088/api/v4/graphql"),
  MIDNIGHT_INDEXER_WS: z.string().default("ws://127.0.0.1:8088/api/v4/graphql/ws"),
  MIDNIGHT_PROOF_SERVER_URL: z.string().default("http://127.0.0.1:6300"),

  MIDNIGHT_ZK_CONFIG_PATH: z.string().default("./managed/academic_credential"),
  MIDNIGHT_PRIVATE_STATE_PATH: z.string().default("./.private-state"),
  MIDNIGHT_WALLET_SEED: z.string().optional(),

  CONTRACT_ADDRESS: z.string().optional(),

  /** Debug/demo endpoints (e.g. tamper). MUST stay false in any deployed config. */
  ALLOW_DEBUG_ENDPOINTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid chain-service configuration:\n${issues}`);
  }
  return parsed.data;
}

/**
 * The Midnight SDK requires Node 22+. Node 20 fails in ways that look like ESM
 * bugs (ERR_PACKAGE_PATH_NOT_EXPORTED, odd loader errors), which costs an hour
 * to diagnose. Fail loudly and early instead.
 *
 * Worth knowing: `node --version` on this machine reports v22 in a login shell
 * but v20 in a plain one, so a process can easily start on the wrong runtime.
 */
export function assertNodeVersion(version: string = process.versions.node): void {
  const major = Number(version.split(".")[0]);
  if (Number.isNaN(major) || major < 22) {
    throw new Error(
      `chain-service requires Node >= 22, but is running on Node ${version}.\n` +
        `The Midnight SDK is ESM-only and fails obscurely on older runtimes.\n` +
        `Fix with:  nvm use 22   (or  nvm alias default 22)`,
    );
  }
}
