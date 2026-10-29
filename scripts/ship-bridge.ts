/**
 * Copy the bridge into `public/` so the hosted site serves it (M54, ISC-547).
 *
 * `scripts/cli-bridge.ts` is the one source. The build runs this first, and
 * `tests/m54-bridge-ships.test.ts` fails if the two ever differ, so a change to
 * the bridge that skipped the build cannot ship a stale copy.
 */

const root = new URL("../", import.meta.url).pathname;
const source = await Bun.file(`${root}scripts/cli-bridge.ts`).text();
await Bun.write(`${root}public/bridge.ts`, source);
console.log("ship-bridge: public/bridge.ts written from scripts/cli-bridge.ts");
