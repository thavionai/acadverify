/**
 * Node has no global WebSocket that the indexer's GraphQL subscription client
 * recognises, so it must be polyfilled BEFORE any Midnight SDK module is
 * evaluated.
 *
 * This lives in its own module on purpose. ESM evaluates every import before the
 * importing module's body runs, so assigning globalThis.WebSocket at the "top"
 * of wallet.ts would still happen AFTER the SDK modules had been evaluated.
 * Importing this file first is the only ordering that actually works.
 */
import { WebSocket } from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
}
