/**
 * The reader is told what the ordinary version is doing (M47).
 *
 * "I clicked on 'the ordinary version of your study' button and it says writing
 * it, but I'm not sure if it's actually doing anything." (Matthew, on the demo
 * of 2026-09-13.)
 *
 * The call is two model round trips, writing the baseline and then reading an
 * ontology back out of it, and it takes about a minute. The button's label was
 * the whole of the feedback, and nothing on the card said where the result would
 * land. What a reader owes is three facts: what is happening, how long it has
 * been going, and where to look when it stops.
 *
 * The arithmetic is a pure function so the three things easiest to get wrong can
 * be held without a clock: the count is only spoken once a whole second has
 * passed, the promise of a minute is withdrawn once the call has outlived one,
 * and the sentence never claims a duration the clock does not support. That last
 * one matters on the hosted site, where there is no model key and the mock
 * returns inside a frame.
 */

import { describe, expect, test } from "bun:test";
import { TWIN_SLOW_AFTER_SECONDS, twinStatusLine } from "../src/workbench/TwinPanel.tsx";

const SOURCE = await Bun.file(
  `${import.meta.dir}/../src/workbench/TwinPanel.tsx`,
).text();

describe("the line under the button while the version is being written", () => {
  test("it says what is happening and where the result appears", () => {
    const line = twinStatusLine(40);
    expect(line.text).toContain("Abductive is writing the ordinary version of your project.");
    expect(line.text).toContain("The version appears under this button when Abductive is done");
    expect(line.slow).toBe(false);
  });

  test("it counts the seconds it has been going", () => {
    expect(twinStatusLine(40).text).toContain("40 seconds so far.");
    expect(twinStatusLine(1).text).toContain("1 second so far.");
  });

  test("Anti: with nothing to count it does not count", () => {
    // The hosted site has no model key and the mock returns inside a frame, so
    // this is the branch a first-time visitor sees. "0 seconds so far" is a
    // duration the clock does not support.
    const line = twinStatusLine(0);
    expect(line.text).not.toContain("0 second");
    expect(line.text).not.toContain("so far");
    expect(line.text).toContain("Abductive is writing the ordinary version of your project.");
    expect(line.text).toContain("The version appears under this button when Abductive is done");
  });

  test("past the ceiling it stops promising a minute and offers the press again", () => {
    const line = twinStatusLine(TWIN_SLOW_AFTER_SECONDS);
    expect(line.slow).toBe(true);
    expect(line.text).toContain("Abductive is taking longer than usual.");
    expect(line.text).toContain("Wait, or try again.");
    // And it does not go on promising what it has already missed.
    expect(line.text).not.toContain("usually within a minute");
    // The count is still there, because how long is the question being asked.
    expect(line.text).toContain(`${TWIN_SLOW_AFTER_SECONDS} seconds so far.`);
  });

  test("Anti: one second under the ceiling is still the ordinary wait", () => {
    expect(twinStatusLine(TWIN_SLOW_AFTER_SECONDS - 1).slow).toBe(false);
  });
});

describe("what the panel does with the line", () => {
  test("the line is mounted only while a call is in flight", () => {
    expect(SOURCE).toContain('{busy && (');
    expect(SOURCE).toContain('data-testid="twin-status"');
  });

  test("the control the slow branch offers is mounted only on that branch", () => {
    // A restart button that is always there is a second way to press the thing
    // the reader has already pressed.
    expect(SOURCE).toContain("{status.slow && (");
    expect(SOURCE).toContain('data-testid="twin-restart"');
    expect(SOURCE).toContain("Try again");
  });

  test("a restart supersedes the call it replaces rather than racing it", () => {
    /* The abandoned call still resolves. Without the run counter its result
     * would be written over the newer one's, and the reader would be shown a
     * comparison from a request they had already given up on. */
    expect(SOURCE).toContain("runId.current += 1;");
    expect(SOURCE).toContain("if (run !== runId.current) return;");
    expect(SOURCE).toContain("if (run === runId.current) {");
    // And the restart is the one press allowed past the in-flight guard, which
    // is the whole point of offering it.
    expect(SOURCE).toContain("if (inFlight.current && !restart) return;");
  });

  test("the error path the panel already had is untouched", () => {
    expect(SOURCE).toContain('<p className="error small" role="alert">');
    expect(SOURCE).toContain("setError(err instanceof Error ? err.message : String(err));");
  });

  test("the line is announced without taking the focus", () => {
    expect(SOURCE).toContain('role="status"');
    expect(SOURCE).toContain('aria-live="polite"');
  });
});
