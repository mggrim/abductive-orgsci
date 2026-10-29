/**
 * One word per page type, for every surface that says it out loud.
 *
 * Sibling of `src/ui/originVocabulary.ts` and written for the same reason, one
 * field to the left. Origin got a module in round nine after four surfaces
 * invented four words for one value; page type never got one, so the same
 * defect ran unchecked in the field beside it for three more waves. The
 * fixture study is why nobody saw it: it holds only `observation` and
 * `puzzle`, two values whose slug and whose English are the same string, so
 * every rendering of them agreed by accident.
 *
 * What a 44-page probe carrying `analytic-residue` showed instead, all of it
 * on one screen:
 *
 *   OntologyGraph.tsx:580     the graph key printed "analytic residue" off an
 *                             inline `type.replace(/-/g, " ")`
 *   PagePanel.tsx:221,259     the index Kind cell and the row's accessible
 *                             name printed "analytic residue" off a second
 *                             copy of the same inline replace
 *   PagePanel.tsx:344         the detail card 30px under that row printed
 *                             "analytic-residue · conjecture · yours", the
 *                             raw slug and the origin module's word inside one
 *                             interpolation, under a comment recording the fix
 *                             of the origin half of that same line
 *   OntologyGraph.tsx:476     the node's own hover <title> printed the raw
 *                             slug too, under the comment that records round
 *                             nine fixing the origin half of that same string
 *   lint/structural.ts:105-112  four finding reasons interpolated the slug
 *                             into prose addressed to a person, so /coherence
 *                             and memo.md both read "(analytic-residue, yours)
 *                             cites no corpus chunk"
 *   export/diagram.ts:240     the exported figure's legend wrote
 *                             `<text>analytic-residue</text>` while the key
 *                             one tab away spelled it with a space
 *   ProposalsTrayView.tsx:37  a private three-entry table with a fourth
 *                             vocabulary again ("an explanation you are
 *                             entertaining"), rendered at the foot of that
 *                             same screen, and partial: the other four types
 *                             fell through to the raw slug
 *   Instrumentation.tsx:540   a fifth private table, this one article-bearing
 *                             ("an analytic residue page")
 *   TwinPanel.tsx:155,167     "(analytic-residue)" beside a title
 *   wikiDirectory.ts:202      "## analytic-residue" as a heading in an
 *                             exported document
 *   coherence.ts:80, semantic.ts:67, designDigest.ts:61
 *                             the slug handed to the model, which is how it
 *                             comes back as model prose the researcher reads.
 *                             That is the round-nine origin leak exactly, and
 *                             the render checks could never see it because by
 *                             the time it reaches the DOM it is not a literal
 *                             any source file contains.
 *
 * So the researcher accepted a page under one name, found it indexed under a
 * second, carded under a third, described in a finding under a fourth and
 * legended in the exported figure under a fifth.
 *
 * Two registers and one derivation, because that is what the surfaces
 * genuinely need. `label` names it beside a mark or in a row of metadata.
 * `gloss` says what it means, beside a field the researcher is deciding about,
 * and is the tray's longer wording promoted out of its private table. The
 * phrase a ledger sentence needs ("an analytic residue page") is derived from
 * the label and a stored article rather than stored as a third set of words,
 * so it cannot drift from the label the way the tray's table did.
 *
 * There is no `written` register here, and the asymmetry with the origin
 * module is deliberate: "yours" needs a third-person form for a document that
 * does not address the researcher, and "analytic residue" is already in the
 * third person.
 *
 * The check is a render, not a grep: no surface's rendered text and no
 * exported document's prose may contain a raw page-type slug. See
 * tests/origin-boundary.test.ts, which holds both fields under the same
 * property.
 */

import type { PageType } from "../ledger/events.ts";

interface PageTypeWords {
  /** The name, beside a mark or in a row of metadata. */
  readonly label: string;
  /**
   * The article the label takes.
   *
   * Grammar, not a name. It is here so the ledger's sentences can be built out
   * of the label instead of out of a second table of noun phrases, which is
   * what `Instrumentation.tsx` was carrying: the summary line read "Drafted a
   * observation" once, because an article hard-coded beside an interpolated
   * slug cannot know the grammar of the word it is glued to.
   */
  readonly article: "a" | "an";
  /** What it means, beside a field the researcher is deciding about. */
  readonly gloss: string;
}

/**
 * The table, private on purpose, for the reason the origin module's is.
 *
 * A table reached through from outside is a table a caller can add a fourth
 * register to, and four registers in five files is the defect this module
 * exists to end. Accessors only: a register that is not here cannot be reached
 * for, and it is total over the enum, so nothing falls through to the slug.
 */
const WORDS: Readonly<Record<PageType, PageTypeWords>> = {
  puzzle: {
    label: "puzzle",
    article: "a",
    gloss: "the thing that your ontology has to explain",
  },
  /*
   * M29: copy. Written before theory claims came from papers.
   *
   * "the account you are offering" described a claim the researcher had made,
   * and that is no longer where these come from: `src/proposals/theory.ts`
   * drafts them out of the papers the researcher named, and stamps
   * `literature-derived` on accept precisely so the record never reads them as
   * the researcher's own. The gloss was telling the reader the opposite of what
   * the origin mark beside it says.
   *
   * "expectation" rather than "theory" for the label as well. A theory page in
   * this tool is one paper's expectation about a setting, stated so the setting
   * can break it, which is a narrower and more useful thing than the word
   * "theory" carries. The stored slug is untouched, so nothing in the ledger or
   * in any saved bundle moves.
   */
  theory: {
    label: "expectation",
    article: "an",
    gloss: "what a paper expects here",
  },
  observation: {
    label: "observation",
    article: "an",
    gloss: "something that the data shows",
  },
  "analytic-residue": {
    label: "analytic residue",
    article: "an",
    gloss: "something that your ontology doesn't absorb",
  },
  "candidate-resolution": {
    label: "candidate resolution",
    article: "a",
    gloss: "an explanation that you're entertaining",
  },
  rival: {
    label: "rival",
    article: "a",
    gloss: "an account that competes with yours",
  },
  "scope-condition": {
    label: "scope condition",
    article: "a",
    gloss: "a boundary on the reach of this claim",
  },
};

/**
 * Ordered as the argument runs: the puzzle, the account of it, what was seen,
 * what the account will not take, what might resolve it, what competes with
 * it, and where it stops holding.
 */
export const PAGE_TYPE_ORDER: readonly PageType[] = [
  "puzzle",
  "theory",
  "observation",
  "analytic-residue",
  "candidate-resolution",
  "rival",
  "scope-condition",
];

/** The name, beside a mark or in a row of metadata. */
export function pageTypeLabel(type: PageType): string {
  return WORDS[type].label;
}

/** What it means, beside a field the researcher is deciding about. */
export function pageTypeGloss(type: PageType): string {
  return WORDS[type].gloss;
}

/**
 * The label as a whole noun phrase, for a sentence rather than a cell.
 *
 * Derived, not stored. `form` picks the article: "a" for a page being
 * introduced, "the" for one already named in the same line.
 */
export function pageTypePhrase(type: PageType, form: "a" | "the"): string {
  const words = WORDS[type];
  return `${form === "a" ? words.article : "the"} ${words.label} claim`;
}

/**
 * The same phrase when the event named no type at all.
 *
 * The ledger can hold a relation mutation, which has no page type, and a
 * proposal whose type field never arrived. Both are real and neither is an
 * error, so they get a phrase rather than a fallback to a slug.
 */
export function untypedPagePhrase(form: "a" | "the"): string {
  return form === "a" ? "a claim" : "the claim";
}
