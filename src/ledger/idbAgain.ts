/**
 * One IndexedDB operation, tried again in a fresh transaction when the browser
 * aborted the last one (M73, ISC-658).
 *
 * Safari, 2026-10-02, with Abductive's question open at a step: WebKit aborted
 * the ledger's `add` for a save's `bound` row ("UnknownError: Attempt to
 * generate key in database without an in-progress transaction"), a `getAll` on
 * the same store with no error at all, and, once the save wrote the record
 * first, the projects store's `put` ("Attempt to delete range from database
 * without an in-progress transaction"). An aborted transaction writes nothing,
 * so running the operation again cannot write twice. Three tries, then the
 * error goes to the caller, which says so on the page.
 *
 * The operation opens its own transaction and awaits its `done` with the
 * request, so an abort is one rejection here and not a second, unhandled one on
 * `tx.done` (the bare "AbortError: AbortError" Safari logged).
 */

const TRANSIENT: ReadonlySet<string> = new Set(["AbortError", "UnknownError", "TransactionInactiveError"]);

export function errorName(err: unknown): string {
  return typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
}

/** How long a retry waits after its `attempt`th abort (M85, ISC-716): 40 ms, then 120 ms. */
export function abortPause(attempt: number): number {
  return 40 * 3 ** attempt;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * M85, ISC-716: the retry waits before it tries again. Safari, 2026-10-14:
 * WebKit aborted five readwrite transactions on the ledger in one millisecond
 * (two writers and their retries), because the retries ran at once into the
 * same burst and all three tries of each writer failed together.
 */
export async function tryAgainOnAbort<T>(
  op: (attempt: number) => Promise<T>,
  tries = 3,
  pause: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt > 0) await pause(abortPause(attempt - 1));
    try {
      return await op(attempt);
    } catch (err) {
      if (!TRANSIENT.has(errorName(err))) throw err;
      last = err;
    }
  }
  throw last;
}

/**
 * Writes one at a time (M85, ISC-716). Each call waits for the write before it
 * to settle, whether that write landed or failed, so a store holds one
 * readwrite transaction open at a time: two writers in one tab queue rather
 * than contend, which is what WebKit aborted.
 */
export function oneAtATime(): <T>(write: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(write: () => Promise<T>): Promise<T> => {
    const run = tail.then(write, write);
    tail = run.catch(() => undefined);
    return run;
  };
}
