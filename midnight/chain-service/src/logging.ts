/**
 * Structured logging with a hard privacy rule.
 *
 * docs/deployment.md classifies a credential field or salt appearing in a log as
 * a P0 incident, not a hygiene issue. Rather than relying on reviewers to notice,
 * `redactWitness` refuses to serialise anything that looks like witness material.
 */
import { pino } from "pino";
import type { Config } from "./config.js";

/** Field names that must never be logged, at any nesting depth. */
const FORBIDDEN_KEYS = new Set([
  "salt",
  "credentialSalt",
  "fields",
  "credentialFields",
  "studentId",
  "secretKey",
  "localSecretKey",
  "sk",
  "seed",
  "witness",
  "privateState",
]);

/**
 * Deep-clone `value`, replacing anything sensitive with a marker. Byte arrays
 * longer than 16 bytes are replaced too: a 32-byte array in a log is almost
 * always a key, a salt, or a commitment pre-image.
 */
export function redactWitness(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted: too deep]";
  if (value === null || value === undefined) return value;
  if (value instanceof Uint8Array) {
    return value.length > 16 ? `[redacted: ${value.length} bytes]` : Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) return value.map((v) => redactWitness(v, depth + 1));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = FORBIDDEN_KEYS.has(k) ? "[redacted]" : redactWitness(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function createLogger(config: Pick<Config, "LOG_LEVEL">) {
  return pino({
    level: config.LOG_LEVEL,
    // Second line of defence: pino's own redaction, for paths we can name.
    redact: {
      paths: [
        "*.salt",
        "*.fields",
        "*.studentId",
        "*.seed",
        "req.body.fields",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
