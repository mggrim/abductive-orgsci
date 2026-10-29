/**
 * Since you were last here (M38, ISC-498).
 *
 * A digest of what moved in the study while this browser was elsewhere, at the
 * head of Design under the standing bar. Counts and states, each one a link to
 * the surface that holds it, and nothing about what any of it meant.
 *
 * The moment it counts from is this browser's, not the study's. Nothing is
 * appended for a visit: the record is the study's history and a co-author
 * opening it to read is not part of that history. So the timestamp lives in
 * `localStorage` and it is read once when the study opens.
 *
 * What gets written, and when, is D55 (M43d). It was `Date.now()` on every hash
 * change and again on the way out, which made the stored moment track the
 * reader's last click. Reloading the tab then cost them the whole session: the
 * walk of 2026-09-13 read `CHANGES 52`, reloaded, and read `CHANGES 0`. So the
 * moment written is the start of the visit being left, written once, when the
 * reader actually leaves. Moving along the rail writes nothing, because moving
 * along the rail is not leaving.
 *
 * M52 (ISC-536) drew the same line one level up. This panel is mounted by Design
 * and by nothing else, so a move to Material, Checks, Your model or Exports took
 * it down and stamped the end of a visit the reader had not ended; coming back
 * read "0 changes. Nothing in this study moved since your last visit." The unit
 * of a visit is the study, not the tab inside it, so the mark is written only
 * when the hash has left the study (`leftTheStudy`).
 *
 * The moment is read once per study and held, because a digest that emptied
 * itself as you read it would be a worse instrument than no digest.
 */

import { useEffect, useRef } from "react";
import type { LedgerEvent } from "../ledger/events.ts";
import {
  FIRST_VISIT,
  readLastSeen,
  sinceLastVisit,
  writeLastSeen,
  type MovedRow,
  type SinceLastVisitView,
} from "../views/sinceLastVisit.ts";
import { FRAMING_PLACE_ID, type PlaceId } from "../views/placeSummary.ts";
import { literaturePath, parseHash, placePath, studyPath } from "../ui/routes.ts";
import { isStationId } from "./stations.ts";
import { Disclosure } from "../ui/components/index.ts";

/**
 * Whether a hash names somewhere outside this study (M52, ISC-536).
 *
 * Exported and taking the hash as a string, so the rule is one sentence with a
 * test on it rather than a condition written inside an effect's cleanup, where
 * nothing can reach it. Anything that is not this study is outside it: another
 * study, the front page, the studies table, the settings page, a hash the router
 * cannot parse.
 */
export function leftTheStudy(hash: string, projectId: string): boolean {
  const route = parseHash(hash);
  return route.view !== "study" || route.projectId !== projectId;
}

/**
 * The moment this browser last had the study open, read once per study.
 *
 * Read during render rather than in an effect, and held in a ref keyed by the
 * study: reading a browser store is side-effect free, and doing it this way
 * means the first render already holds the answer, so the panel never flashes a
 * first visit at a returning reader and never keeps one study's moment while
 * showing another study.
 *
 * The write goes the other way and happens on departure: the page going away, or
 * this component being taken down, which includes moving to another study. What
 * is written is the start of the visit being left rather than the moment of
 * leaving, so a reload does not cost the reader the session they just spent
 * (D55, M43d).
 */
export function useLastSeen(projectId: string): number | null {
  const held = useRef<{
    project: string;
    at: number | null;
    /** When this visit began, which is what the next one counts from (D55). */
    startedAt: number;
  } | null>(null);
  if (held.current === null || held.current.project !== projectId) {
    held.current = { project: projectId, at: readLastSeen(projectId), startedAt: Date.now() };
  }
  const startedAt = held.current.startedAt;
  useEffect(() => {
    /* The moment this visit began, written when it ends (D55, M43d).
     *
     * It used to be `Date.now()` written on every hash change and again on the
     * way out, which made the stored moment track the reader's last click rather
     * than their last visit. Reloading the tab then cost them the session: the
     * walk of 2026-09-13 read `CHANGES 52` before a reload and `CHANGES 0` after
     * it, so the one moment a researcher opens a study to ask what changed while
     * they were away was the moment the strip had nothing to say.
     *
     * Stamping the start of the visit being left means the next reading covers
     * everything from the last time the researcher sat down, and a reload leaves
     * that reading intact.
     *
     * `projectId` and `startedAt` come from the closure rather than from a ref, so
     * a study change writes the moment for the study being left. A ref read here
     * would stamp the study being arrived at, which is the one study whose moment
     * must not move. A hash change inside the same study is not a departure and
     * writes nothing. */
    const mark = () => writeLastSeen(projectId, startedAt);
    // `pagehide` rather than `unload`, which no longer fires reliably, and
    // `beforeunload` as well because a tab closed without a navigation gets
    // only that one in some browsers. Writing twice costs a string. Both are
    // unconditional: the page is going away whatever the hash still says.
    window.addEventListener("pagehide", mark);
    window.addEventListener("beforeunload", mark);
    return () => {
      window.removeEventListener("pagehide", mark);
      window.removeEventListener("beforeunload", mark);
      /* M52, ISC-536. Only when the browser has actually left the study.
       *
       * This panel is mounted by Design and by nothing else, so every move to
       * Material, Checks, Your model or Exports took it down and stamped the end
       * of a visit the reader had not ended. Coming back to Design then read
       * "Since your last visit to this study, 0 changes. Nothing in this study
       * moved since your last visit." — measured on the example at 1495: away to
       * Material, back to Design, and the digest reported nothing had moved
       * while the reader had not been anywhere. A first visit could reach the
       * same line the same way, which is what ISC-536 forbids.
       *
       * D55 already drew this distinction for the rail ("moving along the rail
       * is not leaving") and drew it one level too low: the unit of a visit is
       * the study, not the tab inside it. The hash is read at cleanup, which
       * React runs after the route has changed, so it names where the reader has
       * gone. Still inside this study means they have not left. */
      if (leftTheStudy(window.location.hash, projectId)) mark();
    };
  }, [projectId, startedAt]);
  return held.current.at;
}

/** Where a place's conversation is, with the framing landing on Design. */
function placeHref(projectId: string, place: PlaceId | null): string {
  // The framing has its own route since M38 (ISC-493) and lands with the
  // band's first field marked; anything the rail does not know lands on Design.
  if (place === FRAMING_PLACE_ID) return placePath(projectId, place);
  if (place === null || !isStationId(place)) return studyPath(projectId, "design");
  return studyPath(projectId, "design", place);
}

interface DigestRow {
  readonly key: string;
  readonly label: string;
  readonly row: MovedRow;
  readonly href: string;
}

/** The rows, in the order the work happens, dropping every empty one. */
export function digestRows(
  view: SinceLastVisitView,
  projectId: string,
): readonly DigestRow[] {
  const model = studyPath(projectId, "ontology");
  const all: readonly DigestRow[] = [
    /* M84, ISC-705: the questions asked and answered went (a co-author: a
       count of questions is a distraction). History keeps both. */
    {
      key: "answers",
      label: "Answers saved",
      row: view.answersSaved,
      href: placeHref(projectId, view.lastAnswerPlace),
    },
    { key: "accepted", label: "Suggestions that you accepted", row: view.draftsAccepted, href: model },
    { key: "declined", label: "Suggestions that you rejected", row: view.draftsDeclined, href: model },
    /* M89: "New flags" and "Flags that you settled" went with the checks. */
    {
      key: "papers",
      label: "Papers read",
      row: view.paperVerdicts,
      href: literaturePath(projectId),
    },
  ];
  return all.filter((r) => r.row.count > 0);
}

export function SinceLastHere(props: {
  projectId: string;
  events: readonly LedgerEvent[];
}) {
  const { projectId, events } = props;
  const since = useLastSeen(projectId);
  const view = sinceLastVisit({ events, projectId, since });

  if (view.kind === FIRST_VISIT) {
    return (
      <p className="since-last small muted" data-testid="since-last-first">
        Your first visit to this project.
      </p>
    );
  }

  const rows = digestRows(view, projectId);
  return (
    <div className="since-last" data-testid="since-last">
      <Disclosure
        summary="Since your last visit"
        count={view.total}
        countNoun="changes"
        defaultOpen={view.total > 0}
        testId="since-last-fold"
      >
        {rows.length === 0 ? (
          <p className="small muted" data-testid="since-last-nothing">
            Your project is as you left it at your last visit.
          </p>
        ) : (
          <ul className="since-last-rows">
            {rows.map((r) => (
              <li key={r.key}>
                <a className="linkish" href={r.href} data-testid={`since-${r.key}`}>
                  {r.label}
                </a>
                <span className="since-last-count small muted">{r.row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Disclosure>
    </div>
  );
}
