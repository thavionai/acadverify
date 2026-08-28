/**
 * Single-flight mutex for every operation that submits a transaction or swaps
 * the witness working set.
 *
 * Why this is not optional: the witnesses read from one private-state slot that
 * the service mutates per call. Two concurrent issues would interleave, and one
 * credential would be committed with the other's fields. Nothing crashes — the
 * commitment is simply one that can never be opened, so the credential is
 * silently unprovable forever. An admin double-clicking "Issue" is how you find
 * it, which is to say: on stage.
 */
export class TxQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    // Keep the chain alive even if this task rejects.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
