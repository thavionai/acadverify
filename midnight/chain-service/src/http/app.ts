import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Logger } from "../logging.js";
import { redactWitness } from "../logging.js";
import type { ChainAdapter } from "../chain/ports.js";
import { AppError, isAppError, type ErrorCode } from "./errors.js";
import { buildOpenApiDocument } from "./openapi.js";
import {
  AuthorizeIssuerRequestSchema,
  IssueRequestSchema,
  ProveRequestSchema,
  RevokeRequestSchema,
} from "./schemas.js";

/** Wrap an async handler so rejections reach the error middleware. */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function createApp(adapter: ChainAdapter, config: Config, logger: Logger): Express {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.use((req, res, next) => {
    const requestId = (req.header("x-request-id") ?? randomUUID()) as string;
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    // Mock-only affordance so the frontend can exercise 503 states on demand
    // instead of faking failures by hand.
    if (adapter.mode === "mock") {
      const forced = req.header("x-force-error");
      if (forced) return next(new AppError(forced as ErrorCode));
    }
    next();
  });

  // Machine-readable contract, generated from the same zod schemas the routes
  // validate against, so it cannot drift from actual behaviour.
  app.get("/chain/openapi.json", (_req, res) => {
    res.status(200).json(buildOpenApiDocument(adapter.mode));
  });

  app.get(
    "/chain/health",
    h(async (_req, res) => {
      const health = await adapter.health();
      res.status(health.ok ? 200 : 503).json(health);
    }),
  );

  app.post(
    "/chain/authorize-issuer",
    h(async (req, res) => {
      const { issuerPk } = AuthorizeIssuerRequestSchema.parse(req.body);
      res.status(200).json(await adapter.authorizeIssuer(issuerPk));
    }),
  );

  app.post(
    "/chain/issue",
    h(async (req, res) => {
      const { credentialId, fields } = IssueRequestSchema.parse(req.body);
      const result = await adapter.issue(credentialId, fields);
      logger.info({ credentialId, txId: result.txId }, "credential issued");
      res.status(201).json(result);
    }),
  );

  app.post(
    "/chain/revoke",
    h(async (req, res) => {
      const { credentialId } = RevokeRequestSchema.parse(req.body);
      const result = await adapter.revoke(credentialId);
      logger.info({ credentialId, txId: result.txId }, "credential revoked");
      res.status(200).json(result);
    }),
  );

  app.post(
    "/chain/prove",
    h(async (req, res) => {
      const { credentialId, disclose } = ProveRequestSchema.parse(req.body);
      // Note: a non-VALID status is still HTTP 200 — the request succeeded, the
      // credential simply did not verify. Only OUR failures are 5xx.
      res.status(200).json(await adapter.prove(credentialId, disclose));
    }),
  );

  app.get(
    "/chain/state/:credentialId",
    h(async (req, res) => {
      res.status(200).json(await adapter.state(req.params.credentialId as string));
    }),
  );

  // Demo affordance: makes the forgery beat a live click rather than pre-baked
  // seed data. Gated off by default and never enabled in a deployed config.
  if (config.ALLOW_DEBUG_ENDPOINTS && adapter.tamper) {
    app.post(
      "/chain/debug/tamper/:credentialId",
      h(async (req, res) => {
        res.status(200).json(await adapter.tamper!(req.params.credentialId as string));
      }),
    );
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "No such endpoint.", requestId: res.locals.requestId },
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = res.locals.requestId as string;

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request failed validation.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          requestId,
        },
      });
    }

    if (isAppError(err)) {
      // 5xx means WE failed; log it. 4xx is the caller's business.
      if (err.status >= 500) logger.error({ code: err.code, requestId }, err.message);
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, details: redactWitness(err.details), requestId },
      });
    }

    // Unknown errors must never surface as a credential verdict.
    logger.error({ requestId, err: redactWitness(err) }, "unhandled error");
    return res.status(500).json({
      error: {
        code: "INTERNAL",
        message: "Something went wrong on our side. This is not a statement about the credential.",
        requestId,
      },
    });
  });

  return app;
}
