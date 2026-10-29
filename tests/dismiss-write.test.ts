/**
 * The append every ledger write goes through is the one the provider broadcasts
 * on.
 *
 * This file began as the dismissal-write regression, driven through the Checks
 * tab. M89 tabled Checks and the dismissal controls left with it. What stays is
 * the guarantee underneath: a write that reached the store and never reached
 * the screen would look exactly like a write that was never made.
 */

import { describe, expect, test } from "bun:test";

const SRC = new URL("../src/", import.meta.url).pathname;

describe("the ledger provider's append", () => {
  test("the append the row makes is the one the provider broadcasts on", async () => {
    /* The cross-tab work rewrote `appendAll` to re-read the store and tell the
     * other tabs. */
    const code = await Bun.file(`${SRC}state/ledgerContext.tsx`).text();
    const appendAll = code.slice(code.indexOf("const appendAll = useCallback"));
    expect(appendAll.slice(0, 400)).toContain("await store.append(event)");
    expect(appendAll.slice(0, 400)).toContain("await reflect(batch)");
    const reflect = code.slice(code.indexOf("const reflect = useCallback"));
    // Re-read first, announce second: a tab told to look must find it there.
    expect(reflect.indexOf("store.readAll()")).toBeLessThan(reflect.indexOf("channel.post"));
  });
});
