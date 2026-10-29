/**
 * Routes, and the two levels they encode (ISC-183 … ISC-196).
 *
 * The old bar had four peers: Studies, Bias × Context Matrix, Claude, and the
 * brand. Three different kinds of thing sitting at the same level, and the
 * workbench — where the whole tool actually happens — with no entry at all. A
 * probe across every route showed the bar rendering identically on all of
 * them, never naming the study you were inside, and offering no way back to it
 * from the bias page.
 *
 * The structure the tool actually has is two levels:
 *
 *   app    — the introduction, the list of studies, the provider settings
 *   study  — one study, and the views onto it
 *
 * Everything else follows. The bias page reads one study's ledger, so it is a
 * study view rather than a global page and its picker goes away. Material and
 * exports become study views too, which they always were.
 *
 * The property v2 was forked to create is that the researcher's own ontology
 * stays on screen while they answer questions about it. Until M26 that was
 * read as "the graph lives in the Design view", and the graph is not the
 * ontology: at two pages it was a 420px box holding two truncated labels above
 * a list that said more in a tenth of the room. The graph, the page detail and
 * the whole transcript are their own view now, and Design keeps a compact read
 * of the pages so the commitment holds where it actually bites — you can still
 * see your model while you make claims about it, you just are not being shown
 * a force layout of two dots to do it.
 *
 * Retired routes resolve rather than 404. A co-author may be holding
 * `#/project/:id/tension`, and a link that dies is worse than one that lands a
 * little to the left of where it used to.
 */

import { useEffect, useState } from "react";
import { DEFAULT_STATION, resolveStationId, type StationId } from "../flow/stations.ts";
// Type only. The router may not depend on the projection at runtime; see
// FRAMING_SECTION_ID for the one string the two of them share and the test that
// holds them together.
import type { PlaceId } from "../views/placeSummary.ts";
import type { LedgerEventType } from "../ledger/events.ts";
import { ONTOLOGY_TAB_LABEL } from "../concepts/vocabulary.ts";
// M39, ISC-504. The router is where a route change becomes a DOM change, so it
// is where a transition has to be started. This file imports transitions.ts and
// transitions.ts imports nothing here, so the two are one import apart rather
// than a cycle.
import { armTransition, takeArmedTransition, withTransition, type TransitionName } from "./transitions.ts";

// D1 (M27). Five tabs, in the order the work happens: you design, you add the
// material the design is about, you accept the pages drafted from it, you check
// whether the whole thing hangs together, you take something away. The Biases
// tab left the bar: its grid is a reference map of where the tool watches, not
// a place anyone works, and it is now a section of Checks. Route ids stay
// `ontology` and `coherence` so a co-author's link still lands.
export const STUDY_TABS = [
  /* M53, ISC-540. The theoretical motivation is the first tab, before Design.
   *
   * It was the app's footer dock from M41 to M52, on the owner's instruction of
   * 2026-09-12 that it be "a bar just like the menu bar at the left but as a
   * footer bar that is always present". He reversed that on 2026-09-26, seeing
   * the M52 build: "Move Theoretical Motivation to its own tab in front of
   * Design." The M41 decision is superseded, and the reason it is superseded
   * reads clearly from the two surfaces side by side: the dock took a third of
   * every window on all five tabs to hold three questions a researcher answers
   * once, and its three fields, its conversation and the tool's puzzle reading
   * were laid out as a bar rather than as the page they are.
   *
   * First rather than anywhere else because it is what a study starts from, and
   * a new study opens here.
   */
  "motivation",
  "design",
  // Material second, by decision (Matthew, 2026-09-08): what the study is
  // built on comes right after the design that uses it, and before the two
  // tabs that read both.
  "material",
  "ontology",
  /* M89 (2026-10-14): "coherence", the Checks tab, stood here until the owner
   * tabled the checks: "I think we should fork and remove it from the main
   * version of the prototype." The branch `with-checks` keeps it. An old
   * `#/study/:id/coherence` link falls through to Design (`parseHash`). */
  "exports",
] as const;
export type StudyTab = (typeof STUDY_TABS)[number];

// D1 (M27). Two of the six labels were terms of art that the page underneath
// then had to gloss in its own h1. "Ontology" means three different things
// across philosophy of science, Gioia-style methods writing and computer
// science; "Coherence" is a nominalisation. When a heading needs an apposition
// to be understood, the apposition is the heading.
export const STUDY_TAB_LABEL: Readonly<Record<StudyTab, string>> = {
  /* M50, ISC-531 named it; M53 gives it the tab. The route id is `motivation`
   * rather than `framing` because a co-author's `#/study/:id/framing` link
   * predates the tab and has to keep landing on Design with the station slot
   * falling through, which is what it has always done. The place id on the
   * record stays `framing` (see FRAMING_SECTION_ID below). */
  motivation: "Starting point",
  design: "Design",
  // Next to Material because it is what Design produces out of it, and because
  // the link between a page and the answer that produced it is only readable
  // with both the graph and the transcript in one place.
  // M63, ISC-609: the owner's three words, admitted in Part 5 as the owner's wording.
  ontology: ONTOLOGY_TAB_LABEL,
  material: "Sources",
  exports: "Export",
};

/**
 * When you come here. D1 (M27).
 *
 * Six bare nouns in a bar told a first-time researcher nothing about which one
 * to open, and nothing on any screen said when to open any of them. One
 * sentence per tab, carried as the link's `title`, so the answer is on the
 * control rather than in a manual.
 */
/* `CHECKS_WHY` (M85, ISC-711), the sentence on why Checks existed, went with the
 * tab at M89. */

export const STUDY_TAB_TITLE: Readonly<Record<StudyTab, string>> = {
  motivation:
    "Answer the three questions that a project starts from: your interest, the journal that you're aiming at and the literatures relevant to your exploration.",
  design:
    "Answer the eight questions that make up the project, one step at a time, in whatever order you like.",
  material: "Add the papers that you expect to draw on and the transcripts or notes that you have collected.",
  ontology:
    // M29b. Claims are drafted from the papers too, so the tab's own line
    // cannot name one source.
    // M67, ISC-635: relations are cards beside the concepts.
    // M83, ISC-699: the co-author asked which concepts and relations, and from what; the
    // sources are sourcePhrase's (concepts/vocabulary.ts), and the field list is
    // the section "What to look for in the field", whose lines Abductive adds.
    "Abductive suggests concepts and the relations between them from your answers, your papers and your data. You accept, refine or reject each, and Abductive writes a list of things to look for in the field.",
  exports: "Get a report, a diagram or a bundle to send someone.",
};

/* The retired Biases tab (D1, D7, M27) landed on a section of Checks through
 * `biasesPath` and `biasesRequested`. Both went with Checks at M89: a
 * `#/study/:id/biases` link falls through to Design and the global `#/biases`
 * opens the project list (`parseHash`). */

/**
 * Landing on one section of a tab, rather than at the top of it. D5 (M27).
 *
 * The app routes on `window.location.hash`, so the browser's own fragment scrolling
 * does not exist here. A link written the way a normal site would write it,
 * `#/study/:id/material#literature`, is read by `parseHash` as a tab slot
 * holding "material#literature", which is neither a station nor a tab, so it
 * falls through the catch-all and opens the DESIGN tab. Silently, and on the
 * one link whose whole job is to carry a researcher from their framing to the
 * place the papers are uploaded.
 *
 * So the section is a path segment rather than a fragment. `parseHash` already
 * resolves it without a branch of its own: `material` fills the tab slot,
 * `literature` fills the station slot, and a station slot holding something
 * that is not a station falls back to DEFAULT_STATION. That is a property worth
 * pinning rather than relying on, and `tests/m27-tabs.test.ts` pins it.
 */
export const LITERATURE_SECTION_ID = "literature";

/** The link from the Framing band to the papers, on the Material tab. */
export function literaturePath(projectId: string): string {
  return `#/study/${projectId}/material/${LITERATURE_SECTION_ID}`;
}

/** Whether this hash is asking for the papers rather than the top of Material. */
export function literatureRequested(hash: string): boolean {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  return /^\/(?:study|project)\/[^/]+\/material\/literature$/.test(path);
}

/**
 * Everywhere that sends a reader to the papers, M33.
 *
 * Two surfaces point at the papers now: the framing band's "Upload the papers",
 * which is always inside a study, and the papers node on the landing page's fit
 * diagram, which may not be inside one at all. Both go through here, so the
 * route they send a reader to cannot come apart the way two copies of a hash
 * string would. `literaturePath` stays the one place the string is built.
 *
 * No study means no papers section to land on, so the fallback is the list of
 * studies rather than a route with an undefined id in the middle of it.
 */
export function papersPath(projectId: string | undefined): string {
  return projectId === undefined ? "#/studies" : literaturePath(projectId);
}

/**
 * Where the ordinary version sat on Checks (M30, R10). The landing and its link
 * went with Checks at M89; the id stays because `views/argumentModel.ts`, the
 * pure model of the retired argument band, still names it.
 */
export const ORDINARY_VERSION_SECTION_ID = "ordinary-version";

/**
 * A link that lands partway down a tab.
 *
 * The one shape all three landings share, written once. `parseHash` resolves it
 * without a branch: the tab fills the tab slot, the section fills the station
 * slot, and a station slot holding something that is not a station falls back
 * to DEFAULT_STATION.
 */
export function sectionPath(projectId: string, tab: StudyTab, section: string): string {
  return `#/study/${projectId}/${tab}/${section}`;
}

/**
 * The place id the theoretical motivation is filed under on the record.
 *
 * It is the same string as `FRAMING_PLACE_ID` in views/placeSummary.ts and it is
 * written twice on purpose: the projection may not import the router and the
 * router may not import the projection. tests/m38-chrome.test.ts pins the two
 * against each other, which is the cheaper half of that trade.
 *
 * M38 made it a section of the Design route, because the framing was a fold at
 * the foot of that page. M53 makes it a tab (`motivationPath` below), so this
 * constant is no longer a section of anything: what it still is, and has been
 * since the first `bound` row was written, is the eighth place a conversation
 * happens. The name is kept rather than churned because every study already
 * saved carries `framing` as a place, a topic key and a bound subject.
 */
export const FRAMING_SECTION_ID = "framing";

/**
 * One field of the theoretical motivation, as somewhere a link can land
 * (M53, ISC-540).
 *
 * The next-move bar asks for a field, and the tab it is on is not the tab the
 * bar is on, so asking cannot be an event the way `openFraming` was: the page
 * that would listen is not mounted until the route has changed. The field rides
 * in the station slot behind a prefix, the way a passage id does, so `parseHash`
 * needs no branch for it and a field name can never be read as a station.
 */
export const MOTIVATION_FIELD_PREFIX = "field-";

/**
 * The link to the theoretical motivation, and optionally to one of its fields.
 *
 * Every surface that used to open the dock points here: the study header's
 * open-question line, the rail's eighth cell, the next-move bar's control and
 * the Design companion's way over.
 */
export function motivationPath(projectId: string, field?: string): string {
  return field === undefined
    ? studyPath(projectId, "motivation")
    : sectionPath(projectId, "motivation", `${MOTIVATION_FIELD_PREFIX}${field}`);
}

/** Which field this hash asks for, or null when it asks for the tab alone. */
export function motivationFieldRequested(hash: string): string | null {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  const match = /^\/(?:study|project)\/[^/]+\/motivation\/field-([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * One passage of the material, as somewhere a link can land (M46).
 *
 * The fifth member of the landing family above, and the first whose target is
 * not a fixed section. Your model's side pane draws the passages a claim cites
 * and each one offers the way over to the same passage on Material, where the
 * document it belongs to, the kind it was filed as and the rest of its passages
 * are. A link to `#/study/:id/material` alone lands at the top of a tab holding
 * nine documents and leaves the reader to find the one the pane just showed them.
 *
 * The chunk id rides in the section slot behind a prefix, so `parseHash` needs no
 * branch for it: `material` fills the tab slot, `passage-<id>` fills the station
 * slot, and a station slot holding something that is not a station falls back to
 * DEFAULT_STATION. The prefix is what keeps a uuid out of the station namespace.
 *
 * `passageElementId` is the DOM id the Material tab writes on the passage itself,
 * and it is the same string the route carries: the shell scrolls to an element by
 * id, so a second spelling would be a link that resolves and lands nowhere.
 */
export const PASSAGE_SECTION_PREFIX = "passage-";

/** The link that lands on one passage on the Material tab. */
export function passagePath(projectId: string, chunkId: string): string {
  return sectionPath(projectId, "material", `${PASSAGE_SECTION_PREFIX}${chunkId}`);
}

/**
 * One claim on Your model, as somewhere a link can land (M53, ISC-545).
 *
 * The search's claim results go here. The claim rides in the station slot behind
 * a prefix, the way a passage does on Material, and OntologyView reads it on
 * arrival and selects the claim, which is the "select" half of a result that
 * only navigates and selects.
 */
export const CLAIM_SECTION_PREFIX = "claim-";

export function claimPath(projectId: string, pageId: string): string {
  return sectionPath(projectId, "ontology", `${CLAIM_SECTION_PREFIX}${pageId}`);
}

/** Which claim this hash asks for, or null when it asks for none. */
export function claimRequested(hash: string): string | null {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  const match = /^\/(?:study|project)\/[^/]+\/ontology\/claim-([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * One concept card or relation card on the ontology tab (M67, ISC-632).
 *
 * The owner, 2026-10-02: "There should be links between concepts and
 * relationship cards." A link opens the card and the hash carries it, so the
 * link can be shared within the project, the way a claim's link is.
 */
export type CardKind = "concept" | "relation";

export function cardPath(projectId: string, kind: CardKind, id: string): string {
  return sectionPath(projectId, "ontology", `${kind}-${id}`);
}

/** Which card this hash asks for, or null when it asks for none. */
export function cardRequested(hash: string): { readonly kind: CardKind; readonly id: string } | null {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  const match = /^\/(?:study|project)\/[^/]+\/ontology\/(concept|relation)-([^/]+)$/.exec(path);
  if (match === null) return null;
  return { kind: match[1] as CardKind, id: match[2] ?? "" };
}

/** The DOM id a card carries, for a link to scroll to. */
export function cardElementId(kind: CardKind, id: string): string {
  return `${kind}-${id}`;
}

/** The id the Material tab writes on a passage, for the shell to scroll to. */
export function passageElementId(chunkId: string): string {
  return `${PASSAGE_SECTION_PREFIX}${chunkId}`;
}

/** Which passage this hash asks for, or null when it asks for none. */
export function passageRequested(hash: string): string | null {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  const match = /^\/(?:study|project)\/[^/]+\/material\/passage-([^/]+)$/.exec(path);
  return match?.[1] ?? null;
}

/**
 * Where a place is, as a link (M38).
 *
 * Eight places hold a conversation and seven of them are stations, so every
 * surface that points at one was about to write `studyPath(id, "design", place)`
 * and then special-case the eighth. This is that special case, written once.
 *
 * `PlaceId` is imported as a type alone, so nothing about the projection is
 * pulled into the router at runtime.
 */
export function placePath(projectId: string, place: PlaceId): string {
  return place === FRAMING_SECTION_ID
    ? motivationPath(projectId)
    : studyPath(projectId, "design", place);
}

/**
 * Opening the record, and why it is an event rather than a route (M38, ISC-494).
 *
 * The record has to be reachable and identical from all five tabs, which makes
 * it an overlay over the tab you are standing on rather than a sixth place to
 * stand. A route would have to remember which tab it covered in order to give it
 * back. So the control is a reveal, in the same class as the palette, and it opens the way
 * the palette's chip opens the palette: by dispatching what the one listener is
 * already waiting for, so there is one path to one overlay.
 *
 * Written here rather than in AppShell because the Exports header points at the
 * record too, and a second surface hand-rolling the event name is two names.
 */
export const RECORD_OPEN_EVENT = "abductive:open-record";

/**
 * What a count stands for, carried with the request to open the record (D51).
 *
 * The Exports header says "Press a count to open the record at the entries it
 * counts", and the walk of 2026-09-13 pressed "9 findings" and got the record
 * unfiltered: `EVENTS 1447 · SHOWN 1447`. It opened the record; it did not open it
 * at the entries. So the press names the kinds behind the number and the timeline
 * starts on those, which is the sentence the page already promised.
 *
 * An empty list, or none at all, is every kind, which is what a control with no
 * particular subset means.
 */
export interface RecordOpenRequest {
  readonly kinds?: readonly LedgerEventType[];
}

/** Ask the shell to open the record over whichever tab is showing. */
export function openRecord(request: RecordOpenRequest = {}): void {
  document.dispatchEvent(
    new CustomEvent<RecordOpenRequest>(RECORD_OPEN_EVENT, { bubbles: true, detail: request }),
  );
}

/* `FRAMING_OPEN_EVENT`, `openFraming`, `FRAMING_TOGGLE_EVENT` and `toggleFraming`
 * were here (M40 ISC-507, M43b D26). All four existed because the theoretical
 * motivation was a fold on a page the caller was already standing on, so asking
 * for it was an event rather than a navigation, and a closed `<details>` could
 * not take focus into its body until something had opened it.
 *
 * It is a tab as of M53, so every one of those callers navigates instead and the
 * page it lands on marks and focuses the field the hash names. See
 * `motivationPath` and `motivationFieldRequested` above. An event would now have
 * to reach a component that is not mounted until after the route change, which is
 * the same trap the passage landing avoids by letting the arriving view read the
 * hash itself.
 */

export function isStudyTab(value: string): value is StudyTab {
  return (STUDY_TABS as readonly string[]).includes(value);
}

export type Route =
  /** `walk`: the walkthrough opened at a screen by a page's More help (M62). */
  | { readonly view: "intro"; readonly walk?: number }
  | { readonly view: "studies" }
  | { readonly view: "settings" }
  | {
      readonly view: "study";
      readonly projectId: string;
      readonly tab: StudyTab;
      readonly station: StationId;
    };

export function studyPath(
  projectId: string,
  tab: StudyTab = "design",
  station: StationId = DEFAULT_STATION,
): string {
  return tab === "design"
    ? `#/study/${projectId}/design/${station}`
    : `#/study/${projectId}/${tab}`;
}

/**
 * Names a reader might type for a tab, and the tab each one means (D39, M43d).
 *
 * `#/study/<id>/checks` fails silently today: `checks` is not a tab id, so the
 * slot falls through and the Design station renders while `location.hash` still
 * says `/checks`. The walk of 2026-09-13 hit it from its own operating brief,
 * which is the likeliest source of such a link: the tab is called Checks on
 * screen and its route is `coherence`, and the same is true of Your model. So the
 * label a reader reads resolves to the route it belongs to, rather than to
 * whichever surface the fall-through happens to hit.
 *
 * Only the labels the interface itself shows. A typo gets the fall-through it had,
 * because guessing at one would send a reader somewhere nobody asked for.
 */
const TAB_ALIAS: Readonly<Record<string, StudyTab>> = {
  /* `checks` named Checks until M89; it falls through to Design now. */
  model: "ontology",
  export: "exports",
};

/**
 * The walkthrough's screens, counted here so the router needs nothing from the
 * component (tests/m62-help.test.ts holds the two counts together).
 */
export const GETTING_STARTED_SCREENS = 4;

/**
 * The walkthrough at one screen (M62, ISC-600). "More help" on a page's Help
 * panel opens the screen that covers the page. The address counts from one, the
 * way the walkthrough's "2 of 4" does; the screen index counts from zero.
 */
export function walkPath(screen: number): string {
  return `#/getting-started/${screen + 1}`;
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");

  if (path === "" || path === "/") return { view: "intro" };
  const walk = /^\/getting-started(?:\/(\d+))?$/.exec(path);
  if (walk !== null) {
    const n = walk[1] === undefined ? 1 : Number(walk[1]);
    return { view: "intro", walk: Math.min(Math.max(n, 1), GETTING_STARTED_SCREENS) - 1 };
  }
  if (path === "/studies" || path === "/projects") return { view: "studies" };
  if (path === "/settings" || path === "/auth") return { view: "settings" };
  /* `#/matrix` and `#/biases` opened the bias grid on Checks. The grid went
     with Checks at M89, so both land on the project list. */
  if (path === "/biases" || path === "/matrix") return { view: "studies" };

  // Current: /study/:id/:tab(/:station).  Retired: /project/:id(/:station).
  const parts = /^\/(study|project)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(path);
  const projectId = parts?.[2];
  if (projectId === undefined) return { view: "intro" };

  const a = parts?.[3];
  const b = parts?.[4];

  // A retired `/project/:id/:station` link carries a station where a tab now
  // sits, so a station in that position means the design view.
  //
  // `resolveStationId` rather than `isStationId` as of M27 (D3): the challenge
  // and tension stations merged into `bind`, and a link to either has to land
  // on the station that absorbed it rather than falling through to the default.
  const stationA = a === undefined ? undefined : resolveStationId(a);
  if (stationA !== undefined) {
    return { view: "study", projectId, tab: "design", station: stationA };
  }
  const stationB = b === undefined ? undefined : resolveStationId(b);
  if (a !== undefined && isStudyTab(a)) {
    return {
      view: "study",
      projectId,
      tab: a,
      station: stationB ?? DEFAULT_STATION,
    };
  }
  // D39 (M43d). A tab named by the label it wears on screen.
  const aliased = a === undefined ? undefined : TAB_ALIAS[a];
  if (aliased !== undefined) {
    return { view: "study", projectId, tab: aliased, station: stationB ?? DEFAULT_STATION };
  }
  // Anything else in the tab slot — v1's `dashboard`, a typo, a truncated
  // paste — opens the study rather than failing.
  return { view: "study", projectId, tab: "design", station: DEFAULT_STATION };
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}

/**
 * Navigate, and say that the arrival is the landing of this gesture (M39,
 * ISC-504).
 *
 * The change a transition has to wrap is the `setRoute` below, not this call:
 * the two are separated by the browser's own `hashchange`, so the name is armed
 * here and read there. See `ui/transitions.ts` for the one slot that carries it.
 */
export function navigateWithTransition(hash: string, name: TransitionName): void {
  armTransition(name);
  navigate(hash);
}

/**
 * The route, as state, for a component that has to know where it is (M38).
 *
 * The shell has read the hash this way since M27 and the keyboard layer keeps
 * its own copy of the same six lines, because it needs the route before the
 * shell has rendered anything it could pass down. The rail is the third reader
 * and the reason this moved here: it draws eight places in one study, and the
 * component above it hands it a station id and nothing else, so the study it is
 * drawing is a fact it can only get from the route. Three copies of one
 * subscription is how two of them come to disagree about when a hash change has
 * landed.
 */
export function useRoute(): Route {
  /* `typeof window` so a surface rendered to a string reads as the empty route
   * rather than throwing (M53: the theoretical motivation page is rendered that way
   * by tests/design-page-m27.test.ts). */
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window === "undefined" ? "" : window.location.hash),
  );
  useEffect(() => {
    const onChange = () => {
      /* Read and cleared on every hash change, armed or not (M39, ISC-504). A
       * change nobody armed animates nothing, and cannot inherit a name left
       * behind by one that did. */
      const armed = takeArmedTransition();
      const change = () => setRoute(parseHash(window.location.hash));
      if (armed === null) {
        change();
        return;
      }
      withTransition(change);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/**
 * Your model as a map, as somewhere a link can land (M39, ISC-502).
 *
 * The fifth member of the landing family above, and the first one that is not
 * only a scroll: the map and the claims list are two views over one selection on
 * Your model, so this hash has to arrive with the map showing rather than with
 * the page scrolled to a switch the reader then has to press. `OntologyView`
 * reads `mapRequested` for that; the `SECTION_LANDINGS` row in `AppShell` puts
 * the section on screen, which is the same job it does for the other four.
 *
 * `parseHash` needs no branch, for the reason the whole family shares: `ontology`
 * fills the tab slot, `map` falls through the station slot, and a station slot
 * holding something that is not a station falls back to `DEFAULT_STATION`. That
 * property is pinned by `tests/m27-tabs.test.ts` rather than relied on.
 *
 * Appended at the end of the file rather than beside its siblings because M39 was
 * built as two worktrees over one route module, and a seam is cheaper at the
 * bottom of a file than in the middle of one.
 */
export const MODEL_MAP_SECTION_ID = "map";

/** The link that opens Your model with the map showing. */
export function modelMapPath(projectId: string): string {
  return sectionPath(projectId, "ontology", MODEL_MAP_SECTION_ID);
}

/** Whether this hash is asking for the map rather than the claims list. */
export function mapRequested(hash: string): boolean {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  return /^\/(?:study|project)\/[^/]+\/ontology\/map$/.test(path);
}
