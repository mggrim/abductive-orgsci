/**
 * The one landmark every route has to expose, and the link that jumps to it.
 *
 * The survey probed all ten routes and found /design/context and /design/tension
 * rendering zero `<main>` and zero `<h1>` while the other eight rendered one of
 * each, and no skip link anywhere. Two of those are one-line fixes in one
 * component; the third is not, because this app routes on `window.location.hash`
 * and an `<a href="#main">` would be read by the router as a navigation to a
 * route called "main". So the skip control is a button that moves focus, which
 * is also why `<main>` carries `tabIndex={-1}`: a focus target that is not
 * focusable silently does nothing.
 *
 * The id lives here rather than as a literal in nine files so that a surface
 * builder adding a route gets the landmark by importing a name, and so the test
 * that counts landmarks per route has something to count.
 */

export const MAIN_LANDMARK_ID = "main-landmark";

/** What the skip control does. Exported so the test can call it, not to reuse. */
export function focusMainLandmark(): void {
  const main = document.getElementById(MAIN_LANDMARK_ID);
  if (main === null) return;
  main.focus();
  // Focus alone does not scroll a container that is already partly in view, and
  // a skip link that leaves the reader where they were has not skipped.
  main.scrollIntoView({ block: "start" });
}
