/**
 * The claims graph in Abductive's voice (moved out of the retired model tab,
 * M63).
 *
 * A model sentence was scrubbed of banned dashes while it sat in the tray and
 * un-scrubbed the moment it was accepted, because the display table normalises
 * suggestions and not ontology mutations. Every reader of the graph (the
 * ontology tab, the readiness report's argument and rivals, and the reading
 * exports) goes through this one composition. Nothing is stored; identity is
 * kept when nothing changed.
 */

import type { OntologyGraph as Graph, OntologyPage, PageVersion } from "../ontology/schema.ts";
import { containsBannedDash, normaliseModelProse } from "../inference/voiceGate.ts";

function voicedText(text: string): string {
  return containsBannedDash(text) ? normaliseModelProse(text) : text;
}

/** Same revision when it was already clean. See {@link voicedGraph}. */
function voicedVersion(version: PageVersion): PageVersion {
  const title = voicedText(version.title);
  const body = voicedText(version.body);
  return title === version.title && body === version.body ? version : { ...version, title, body };
}

/** Same page when it was already clean. See {@link voicedGraph}. */
function voicedPage(page: OntologyPage): OntologyPage {
  const title = voicedText(page.title);
  const body = voicedText(page.body);
  const history = page.history.map(voicedVersion);
  const historyChanged = history.some((v, i) => v !== page.history[i]);
  if (title === page.title && body === page.body && !historyChanged) return page;
  return { ...page, title, body, ...(historyChanged ? { history } : {}) };
}

/**
 * The ontology as it is read, with the pages in the tool's voice.
 *
 * The defect this fixes. `src/ledger/displayProse.ts` normalises model prose on
 * the way out of the ledger, and its table lists `proposal: ["title", "body"]`
 * and nothing for `ontology-mutation`. So one model sentence was scrubbed while
 * it sat in the tray and un-scrubbed the moment it was accepted: on the fixture
 * study, one click from load, the page-detail card rendered a U+2014 in "and it
 * isn't [dash] that's the misunderstanding I'm being told I have", directly
 * under its own metadata line reading "puzzle, conjecture, model-proposed, v1".
 * A second click found a second one, on the other page of the same two-page
 * fixture. `voiceGate.ts` names this exact case the worst of the four it was
 * written for, "because a draft body is accepted into the researcher's own
 * model and then exported under their name".
 *
 * Why every page and not only the model-proposed ones. The exemption in
 * `displayProse.ts` is argued as protecting "the researcher's own words ... a
 * page they have already accepted and had the chance to edit", and that
 * sentence puts an ontology page in the same category as a response, a refusal
 * note, a flag reason and a finding dismissal. It does not belong there, and
 * the fixture shows why. The second dash is on a page stamped
 * `origin: "author-prior"`, and its body is byte-identical to a
 * `persona:drafter` proposal sitting in the same ledger. Origin was never a
 * record of who typed the sentence: `adjudicate.ts` used to flip it to
 * `author-prior` when the researcher edited a draft, that flip was removed, and
 * pages stamped by it are still in the store. Today no path in `src/` creates
 * an ontology page from researcher-typed prose at all. `op: "create"` for a
 * page is written in exactly three places, `proposals/adjudicate.ts`,
 * `twin/twinOntology.ts` and the eval harness, and there is no writer for
 * `op: "revise"`; every page body on this screen is a model draft, or a
 * researcher's edit inside a model's frame, which is why the same file stamps
 * both `model-proposed`. So an origin-keyed rewrite would have been a rule
 * keyed on a field that does not carry the fact it was being asked about, and
 * it measured as one: it left the second dash on screen.
 *
 * What is genuinely the researcher's is untouched, here and in
 * `displayProse.ts`: responses, refusal notes, flag reasons and finding
 * dispositions are typed into a box by the person being interviewed and no rule
 * in this codebase rewrites them.
 *
 * Why the fix is here and not in `displayProse.ts`. That table is keyed by
 * event type and this rule is not a property of the event type. It is a
 * property of what an ontology page is, which is a projection-level fact, so it
 * is applied where the projection is read. Both readers of it, the drawing and
 * the index, hang off this one composition, which is the same argument
 * `displayProse.ts` makes for applying its own rule once in the provider.
 *
 * Nothing is stored. This maps a value on its way to a renderer; the ledger,
 * the replay and `rawText` provenance are untouched.
 *
 * Who calls this, and it is two places on purpose. This view, so the drawing,
 * the index, the detail card, the revision list and the transcript all read one
 * sentence. And `StudyViews.tsx`'s `StudyExports`, which hands the result to
 * `ExportBar`, because `ExportBar` destructures one `graph` off its props into
 * `buildOntologyMemo`, `buildDiagramSvg`, `buildAgentGraph` and
 * `buildWikiFiles`: voicing it once at that prop covers all four reading
 * exports at the point they share, the way this view covers its own readers at
 * the point they share. For four rounds that second call site was not written
 * and the measurement did not move: `memo.md` was 4,159 characters carrying one
 * U+2014, in the sentence the detail card one tab away rendered with a comma,
 * and `ontology.json` carried two. Screen and file disagreed about the same
 * sentence. Both call sites must exist for that to stay fixed, and
 * `tests/export-voice.test.ts` pins the export half by building a ledger whose
 * ontology-mutation is `origin: "model-proposed"` and carries a dash, which is
 * the case the FND-01 export fixture cannot see.
 *
 * `ledger.json` and `bundle.json` deliberately do not read this. They serialise
 * the events rather than the ontology projection, and the bundle is
 * re-importable: a page body rewritten inside either one would hand a co-author
 * a history that never happened. /exports says which files are readings and
 * which are the record, so nothing on that page claims otherwise.
 *
 * Identity is preserved when nothing changed, because `OntologyGraphView`
 * memoises the force layout on the graph object and a fresh map per render
 * would re-settle the simulation on every keystroke elsewhere on the page.
 */
export function voicedGraph(graph: Graph): Graph {
  let changed = false;
  const pages = new Map<string, OntologyPage>();
  for (const [id, page] of graph.pages) {
    const next = voicedPage(page);
    if (next !== page) changed = true;
    pages.set(id, next);
  }
  return changed ? { ...graph, pages } : graph;
}
