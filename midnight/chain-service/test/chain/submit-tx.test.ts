/**
 * Regression test for a real gap found during review: nothing wrapped the
 * `callTx.*` calls in live.ts, so a proof-server outage during issue/revoke/
 * authorize fell through to a generic 500 INTERNAL instead of the honest,
 * named PROOF_SERVICE_UNAVAILABLE the role's own Responsibilities require
 * ("proof-server timeout is PROOF_SERVICE_UNAVAILABLE... surface honest
 * errors"). submitTx() is the fix; this pins its classification behaviour
 * directly, which is faster and more reliable than actually stopping the
 * proof-server container mid-test.
 */
import { describe, expect, it, vi } from "vitest";
import { submitTx } from "../../src/chain/live.js";
import { AppError } from "../../src/http/errors.js";
import { createLogger } from "../../src/logging.js";

const silentLogger = createLogger({ LOG_LEVEL: "fatal" });

describe("submitTx", () => {
  it("returns the value on success without touching the logger", async () => {
    const errorSpy = vi.spyOn(silentLogger, "error");
    const result = await submitTx(silentLogger, "issue", async () => "ok");
    expect(result).toBe("ok");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("classifies an unexpected failure as PROOF_SERVICE_UNAVAILABLE, not a bare 500", async () => {
    await expect(
      submitTx(silentLogger, "issue", async () => {
        throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:6300");
      }),
    ).rejects.toMatchObject({ code: "PROOF_SERVICE_UNAVAILABLE", status: 503 });
  });

  it("classifies an SDK-shaped failure (e.g. a rejected finalized tx) the same way", async () => {
    // Shape of @midnight-ntwrk/midnight-js-contracts' CallTxFailedError without
    // importing the class itself: an Error subtype carrying finalizedTxData.
    class FakeCallTxFailedError extends Error {
      constructor(readonly finalizedTxData: unknown) {
        super("Transaction failed");
      }
    }
    await expect(
      submitTx(silentLogger, "revokeCredential", async () => {
        throw new FakeCallTxFailedError({ txId: "deadbeef" });
      }),
    ).rejects.toMatchObject({ code: "PROOF_SERVICE_UNAVAILABLE", status: 503 });
  });

  it("passes an intentional AppError through unchanged rather than reclassifying it", async () => {
    await expect(
      submitTx(silentLogger, "issue", async () => {
        throw new AppError("DUPLICATE_CREDENTIAL", "already exists");
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CREDENTIAL", status: 409 });
  });

  it("logs the real cause server-side even though the client only sees the honest code", async () => {
    const errorSpy = vi.spyOn(silentLogger, "error").mockImplementation(() => silentLogger);
    await submitTx(silentLogger, "issue", async () => {
      throw new Error("proof server timed out after 30000ms");
    }).catch(() => {});
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: "issue", cause: expect.stringContaining("timed out") }),
      "callTx failed",
    );
    errorSpy.mockRestore();
  });
});
