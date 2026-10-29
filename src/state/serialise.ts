/**
 * One writer at a time, and never a dropped request.
 *
 * Written for the framing band, where a boolean guard returned early while a
 * save was running and the save ended in a model call: every blur inside that
 * window was thrown away silently, and filling four fields at ordinary speed
 * lost two of them.
 *
 * The paper judge had the same shape one surface over. A paper uploaded while
 * another was being judged was never picked up, because the run in flight was
 * working from a list read before that paper existed and nothing asked again
 * when it finished.
 *
 * So: a request raises a flag, and whoever owns the loop keeps working until
 * the flag is down. Each pass reads the current state afresh, so the last pass
 * carries the latest, and no request is lost.
 */

/**
 * Where a save loop keeps its two flags.
 *
 * A plain object rather than component state, because the loop has to read the
 * flags between awaits and a render is not a synchronisation point.
 */
export interface SaveLoop {
  running: boolean;
  pending: boolean;
}

/**
 * Run the write, and keep running it while more work arrives.
 *
 * The band had a boolean that returned early while a save was running, and the
 * save ended with a model call judging the papers, so every blur inside that
 * window was thrown away without a word. Filling four fields at ordinary speed
 * lost two of them.
 *
 * Dropping a save is not acceptable and neither is running two at once, because
 * two writers of one record race. So a request raises a flag and whoever owns
 * the loop keeps writing until the flag is down. Each pass reads the current
 * values afresh, so the last write carries the latest state and no request is
 * lost. Returns whether anything was actually written.
 */
export async function serialise(
  loop: SaveLoop,
  write: () => Promise<boolean>,
): Promise<boolean> {
  loop.pending = true;
  /* Someone else owns the loop and will pick up the flag just raised. Reporting
   * false here is not "nothing was written", it is "not by this call": the
   * owner returns the answer. */
  if (loop.running) return false;
  loop.running = true;
  let wrote = false;
  try {
    while (loop.pending) {
      loop.pending = false;
      wrote = (await write()) || wrote;
    }
  } finally {
    loop.running = false;
  }
  return wrote;
}

