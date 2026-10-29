/**
 * The staging tray (ISC-54 … ISC-57).
 *
 * Rejections are shown, not hidden behind a filter. A researcher scrolling
 * past what they declined is the point: the pattern of refusals is a finding
 * about the boundaries of their own account, and it only reads as one if it
 * stays in view.
 *
 * The title and body are editable in place, and that is not a convenience.
 * Drafts written from the researcher's own interview answers reach this tray
 * too, and a typed page slot cannot hold the hedging that a spoken answer
 * carries — what survives extraction is the confident residue. Accepting that
 * residue with one click would fill the ontology with declarative commitments
 * distilled from tentative speech. So the fields are open before the decision
 * rather than after it.
 *
 * Editing does not make the page yours. That was the first design and it was
 * wrong twice over: it asserted you held the idea before the model offered it,
 * when editing a draft is evidence of the reverse, and it made agreeing with a
 * draft you genuinely agree with look like abdication. The page stays
 * model-proposed and the edit is recorded next to it.
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
import { adjudicateProposal } from "../proposals/adjudicate.ts";
import type { NearDuplicate, Proposal, ProposalTray } from "../proposals/types.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { Disclosure, EmptyState, Row, StatusChip } from "../ui/components/index.ts";

/*
 * The words for a page type are not this file's to invent, and this file
 * invented them.
 *
 * There was a private PAGE_TYPE_LABEL here with three entries and a comment
 * claiming "five of the seven are ordinary English already and are left alone.
 * The two hyphenated ones were reaching the screen as slugs". Both halves were
 * false: PAGE_TYPES has three hyphenated members, not two, and the four types
 * with no entry were not left alone, they fell through `?? type` and reached
 * the screen as the slug the comment said had been fixed. A comment describing
 * behaviour the code does not have is a defect on its own, and this one was
 * describing the defect it sat on.
 *
 * Worse than partial, it was a fourth vocabulary. The researcher accepted a
 * page here under "an explanation you are entertaining", found it indexed as
 * "candidate resolution", carded as "candidate-resolution" and described in a
 * finding as "candidate-resolution" again, all on this screen. The longer
 * wording is right for this surface, which is why it survives as the module's
 * `gloss` register rather than being dropped: the tray is the one place the
 * researcher is deciding whether a page is that kind of thing at all, so it
 * gets the definition and the index gets the name.
 */
import { pageTypeGloss } from "../ui/pageTypeVocabulary.ts";
import type { LedgerEvent, PageType } from "../ledger/events.ts";
import { baselineOfTopic } from "../proposals/baselines.ts";

/**
 * A proposal may carry no type at all, and that is a real state rather than an
 * error, so it gets a phrase instead of a fall-through.
 */
function proposalKind(type: PageType | undefined): string {
  return type === undefined ? "type not set" : pageTypeGloss(type);
}

/**
 * Where a draft came from, in the words the reader has for the three sources.
 *
 * There are three now and the kicker knew about two. The paper reader
 * (`src/proposals/theory.ts`, actor `persona:reader`) drafts an expectation out
 * of a paper the researcher named, and the tray filed every one of those under
 * "drafted from your material", which is the sentence for the researcher's own
 * transcripts and fieldnotes. On a tab whose whole promise is that you can
 * always see who put a claim there, the one draft that came out of somebody
 * else's argument was labelled as coming out of the reader's own data.
 *
 * The signal is `originOnAccept`, which `theory.ts` is the only writer of and
 * which is on the projection already. Reading the actor instead would mean
 * widening `Proposal` to carry it, for a fact this field already states.
 *
 * Naming the paper when a citation resolves to one, because "your papers" is
 * three to five documents and which one it read is the thing a researcher
 * checks first. It falls back to the plural whenever the citation does not
 * resolve, which happens on a bundle imported without its corpus.
 */
export function draftSource(
  proposal: Pick<Proposal, "sourceTurn" | "originOnAccept" | "sourceChunks">,
  documents: readonly StoredDocument[],
  chunks: readonly Chunk[],
  /** Turn id to the paper whose expectation that turn answered, when it did. */
  answeredAbout?: ReadonlyMap<string, string>,
): string {
  if (proposal.originOnAccept === "literature-derived") {
    const byId = new Map(chunks.map((c) => [c.id, c.documentId] as const));
    const names = new Map(documents.map((d) => [d.id, d.name] as const));
    for (const chunkId of proposal.sourceChunks) {
      const name = names.get(byId.get(chunkId) ?? "");
      if (name !== undefined) return `suggested from ${name}`;
    }
    return "suggested from your papers";
  }
  if (proposal.sourceTurn === undefined) return "suggested from your data";
  /* Which expectation the answer was given against (M33 fix 3).
   *
   * The record has always known: the move carried the baseline id and the
   * question-selection event carries the topic. Nothing said so, so a draft
   * from a baseline answer sat in the tray looking like any other, with no
   * sign of the paper it was about. */
  const paper = answeredAbout?.get(proposal.sourceTurn);
  return paper === undefined
    ? "suggested from your answer"
    : `suggested from your answer on the expectations of ${paper}`;
}

/**
 * Which paper each answered turn was about, for the line above.
 *
 * A projection rather than a field on the proposal: the link from an answer to
 * the expectation it answered is already on the record, in the topic of the
 * question the answer replies to, and adding a second copy of it to the
 * proposal would be two places to disagree.
 */
export function turnsAnsweringBaselines(
  events: readonly LedgerEvent[],
  projectId: string,
  baselines: ReadonlyMap<string, { readonly paperName: string }>,
): ReadonlyMap<string, string> {
  const paperOfBaseline = new Map<string, string>();
  for (const paper of baselines.values()) {
    for (const b of (paper as { baselines?: readonly { id: string }[] }).baselines ?? []) {
      paperOfBaseline.set(b.id, paper.paperName);
    }
  }
  const paperOfQuestion = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "question-selection" || event.projectId !== projectId) continue;
    const id = baselineOfTopic(event.topic);
    const paper = id === undefined ? undefined : paperOfBaseline.get(id);
    if (paper !== undefined) paperOfQuestion.set(event.id, paper);
  }
  const out = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "response" || event.projectId !== projectId) continue;
    if (event.actor !== "human" || event.inReplyTo === undefined) continue;
    const paper = paperOfQuestion.get(event.inReplyTo);
    if (paper !== undefined) out.set(event.id, paper);
  }
  return out;
}

export function ProposalsTrayView(props: {
  projectId: string;
  tray: ProposalTray;
  duplicates: readonly NearDuplicate[];
  /** The papers and the data, so a draft from a paper can name which one. */
  documents?: readonly StoredDocument[];
  chunks?: readonly Chunk[];
  /** Turn id to the paper whose expectation that turn answered (M33 fix 3). */
  answeredAbout?: ReadonlyMap<string, string>;
  /** M67, the lead's ruling: the home Abductive proposed for a waiting claim, with its select. */
  homeSlot?: (proposalId: string) => ReactNode;
  /** M67: after a claim is accepted, where its statement goes; told the page the accept created. */
  afterAccept?: (proposalId: string, pageId: string) => Promise<void> | void;
}) {
  const { projectId, tray, duplicates } = props;
  const documents = props.documents ?? [];
  const chunks = props.chunks ?? [];
  const { appendAll, readEvents } = useLedger();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, { title: string; body: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const dispose = useCallback(
    async (
      proposalId: string,
      disposition: "accept" | "reject" | "merge" | "defer",
      mergedInto?: string,
    ) => {
      const edit = edits[proposalId];
      if (busy.current) return;
      busy.current = true;
      setError(null);
      try {
        const outcome = await adjudicateProposal(
          {
            projectId,
            proposalId,
            disposition,
            ...(reasons[proposalId] === undefined ? {} : { reason: reasons[proposalId] }),
            ...(mergedInto === undefined ? {} : { mergedInto }),
            ...(edit === undefined ? {} : { edit }),
          },
          { appendAll, readEvents },
        );
        if (outcome.kind === "rejected") setError(outcome.errors.join("; "));
        if (outcome.kind === "recorded" && disposition === "accept" && props.afterAccept !== undefined) {
          const created = outcome.events.find((e) => e.type === "ontology-mutation" && e.op === "create");
          if (created?.type === "ontology-mutation") await props.afterAccept(proposalId, created.targetId);
        }
      } finally {
        busy.current = false;
      }
    },
    [projectId, reasons, edits, appendAll, readEvents, props.afterAccept],
  );

  const dupFor = (id: string) => duplicates.find((d) => d.proposalId === id);

  /**
   * One draft, with its fields open and its three decisions (D36, M43c).
   *
   * Factored out of the pending list because there are two lists now. A draft
   * the researcher set aside is still undecided, so it gets the same card: the
   * same editable title and body, the same "Put it in", the same "Turn it down".
   * A second list of read-only titles with a "bring it back" button would have
   * been a fourth control for the decision the card already carries, and it
   * would have needed an event that withdraws a disposition, which this ledger
   * does not have and should not grow for this.
   *
   * `setAside` only changes what the card says about itself. "Decide later" is
   * gone from a card that is already set aside, because pressing it would write
   * a second defer that the researcher could not see happen.
   */
  const card = (p: Proposal, setAside: boolean) => {
    const dup = dupFor(p.id);
    const edit = edits[p.id] ?? { title: p.title, body: p.body };
    const changed = edit.title.trim() !== p.title.trim() || edit.body.trim() !== p.body.trim();
    const set = (patch: Partial<{ title: string; body: string }>) =>
      setEdits((e) => ({ ...e, [p.id]: { ...edit, ...patch } }));
    return (
      <li
        key={p.id}
        className="tray-item"
        data-proposal-id={p.id}
        data-set-aside={setAside ? "true" : undefined}
      >
        <span className="small muted tray-source">
          {/* "drafted", not "written". A page that has been accepted is
              written; one sitting in this tray is not, and /studies, the
              station aside and the ledger heading above all call this
              population drafted.

              Which of the three sources it was comes out of `draftSource`
              now, because there are three and this line knew about two. */}
          {draftSource(p, documents, chunks, props.answeredAbout)}
          {" · "}
          {/* Was the raw slug, then was a private table that covered
              three of the seven and let the other four back through to
              the slug. src/ui/pageTypeVocabulary.ts is total over the
              enum, so there is no fall-through left to leak. */}
          {proposalKind(p.pageType)}
        </span>
        <label className="visually-hidden" htmlFor={`title-${p.id}`}>
          Title
        </label>
        <input
          id={`title-${p.id}`}
          className="tray-title"
          value={edit.title}
          onChange={(e) => set({ title: e.target.value })}
          data-testid={`title-${p.id}`}
        />
        <label className="visually-hidden" htmlFor={`body-${p.id}`}>
          Claim text
        </label>
        <textarea
          id={`body-${p.id}`}
          className="tray-body"
          rows={4}
          value={edit.body}
          onChange={(e) => set({ body: e.target.value })}
          data-testid={`body-${p.id}`}
        />
        <p className="small muted" data-testid={`edited-${p.id}`}>
          {changed ? "History keeps your edit." : "The model's words, unchanged."}
        </p>
        {p.edge === undefined && props.homeSlot?.(p.id)}
        {dup !== undefined && (
          <p className="small duplicate-prompt" data-testid="duplicate-prompt">
            {dup.prompt}
          </p>
        )}
        {/* The placeholder said "required to decline or merge" while
            Merge only exists when a near-duplicate was found, so most of
            the time it named a button that was not on screen. */}
        <input
          className="reason"
          placeholder={
            dup === undefined
              ? "Reason for rejecting (needed to reject)"
              : "Reason for rejecting or merging"
          }
          value={reasons[p.id] ?? ""}
          onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))}
          data-testid={`reason-${p.id}`}
        />
        {/* R4 item 9. The expected path is filled and the declines are
         * text, which is the pattern the step column already uses with
         * "Doesn't apply to this study · Decide later".
         *
         * Three peer buttons per draft rendered as three equal ways of
         * making it go away, twice over on the fixture. Demoted, never
         * removed and never harder to reach: turning a draft down is a
         * real decision and the record keeps it. */}
        <div className="tray-actions">
          <button type="button" className="primary" onClick={() => void dispose(p.id, "accept")}>
            {changed ? "Accept my edit" : "Accept"}
          </button>
          <span className="tray-declines">
            <button type="button" className="linkish" onClick={() => void dispose(p.id, "reject")}>
              Reject
            </button>
            {dup !== undefined && (
              <>
                {" · "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void dispose(p.id, "merge", dup.existingPageId)}
                >
                  Merge into "{dup.existingTitle}"
                </button>
              </>
            )}
            {!setAside && (
              <>
                {" · "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void dispose(p.id, "defer")}
                >
                  Decide later
                </button>
              </>
            )}
          </span>
        </div>
        {/* R3 item 6. What each of the three buttons does moved up into
            the "What happens when I decide?" fold at the head of the
            tray, where it is said once rather than once per draft. */}
      </li>
    );
  };

  return (
    <section className="tray" data-testid="proposals-tray">
      {/* A StatusChip, not `.badge`. StatusChip's own docstring says why it
          exists: "three surfaces rendered a number in a badge beside a word in
          a pill, at two sizes". Two of those survived, and this was the one a
          researcher meets most, since the count next to this heading is the
          same population the Design banner and the /studies row both report as
          a chip. `.badge` also fills with --notice and prints inverse ink, so
          the queue of drafts waiting on you was the loudest mark on the Ontology
          tab, louder than the findings. Same tone, same size, same component as
          every other count in the app. */}
      {/* D6 (M27). The tray is the first block on the Your model page now, and
          the heading says what is being asked rather than where the pages are
          going. Where they go is the rest of the page, directly under it. */}
      <h3>
        Suggestions to review
        <StatusChip label="suggestions" count={tray.pending.length} tone="notice" />
      </h3>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {tray.pending.length === 0 ? (
        /* EmptyState, not a bare muted sentence. Every other empty region in
           the app answers with a status and a teaching line in the same box:
           the ledger, the material picker, the export receipt, the findings
           list, the studies list. This one answered with one paragraph in no
           container, which is precisely the shape FND-09 built the component to
           end. The two clauses were already a status and a teaching line; they
           are just in the right slots now. */
        /* D36 (M43c). "Nothing waiting." with two set-aside drafts on the
           screen below it is the page contradicting itself, so the status names
           the queue rather than the tray when drafts are still set aside. */
        <EmptyState
          status={tray.deferred.length === 0 ? "You have decided on every suggestion." : "You have decided on every new suggestion."}
          teach="Answer a question on Design, and Abductive suggests claims here."
          testId="tray-empty"
        />
      ) : (
        <>
          {/* Function before caveat. The old blurb opened "Drafts, not
              decisions", which is the second thing you need to know and reads
              as a warning about something you have not been told the purpose
              of yet. It never used the word "page" until it was explaining
              what happens to one, and never named the ontology at all, which
              is the thing these go into. */}
          {/* No link to the Ontology tab in here any more: the tray moved on
              to it at M26c, so the sentence was pointing at the page it was
              printed on. The pointer that matters now is the one on the Design
              tab, in the standing bar, which names this tab. */}
          {/* R3 item 6. One instruction before the controls; the rest, which
              is what happens after you press one, behind a fold. It was three
              sentences before the first button and three more after it. */}
          {/* R4 item 8. One instruction before the controls. The tab lede and
              the fold below both carry what happens after you press one. */}
          {/* M62, ISC-600: held on the page. This sentence glosses "claim" where a reader
          first meets the term, which the copy standard's Part 5 (M61, ISC-585) requires
          on the page; moving it into the Help panel is returned to the lead. */}
          <p className="muted small">
            A suggestion becomes a claim (a statement in your ontology) once you accept the suggestion.
            Read each suggestion, edit anything that you wouldn't defend, then decide.
          </p>
          {/* M62, ISC-600: the Learn more fold under it moved into the page's Help control (ui/pageHelp.ts). */}
        </>
      )}

      <ul className="tray-list">{tray.pending.map((p) => card(p, false))}</ul>

      {/* The drafts you set aside, and they are the reason this section exists
          (D36, M43c).

          They rendered nowhere. The walk of 2026-09-13 pressed "Decide later" on
          two drafts, both left the tray, neither appeared in any list, neither
          was in the page text at all, and a full reload did not bring them back,
          while the twenty-six turned-down drafts below stayed on the record with
          the researcher's own reasons under each. So the one decision that means
          "I will come back to this" was the one that lost the draft.

          Above the turned-down list rather than below it, because a draft still
          waiting on the researcher is closer to the queue than one they have
          already answered. */}
      {tray.deferred.length > 0 && (
        <div className="tray-set-aside" data-testid="set-aside-proposals">
          <h4 className="small">Set aside ({tray.deferred.length}). Still yours to decide</h4>
          <p className="muted small">
            You pressed "Decide later" on these suggestions. Edit a suggestion and accept it, or reject it.
          </p>
          <ul className="tray-list">{tray.deferred.map((p) => card(p, true))}</ul>
        </div>
      )}

      {tray.rejected.length > 0 && (
        <div className="tray-rejected" data-testid="rejected-proposals">
          <h4 className="small">
            Rejected ({tray.rejected.length}). Kept in History
          </h4>
          {/* M32b item 4. The last bulleted list on a surface made of rows.
              Every sibling region on this route is the row primitive and this
              one was a `<ul>` with markers and a run-on line per draft, which
              the confirmation pass read as the page reverting to a document
              halfway down.

              One row per turned-down draft: the title struck through, as it
              already was, and the reason on the row's second line rather than
              spliced onto the first after a colon. Nobody's words change; the
              colon was punctuation joining two things that are now on two
              lines, and it goes the way the bullet does.

              No actions, and no mark. There is nothing to do to a turned-down
              draft — the ledger has no event that withdraws a disposition, the
              same reason a dismissed finding carries no control — and a draft
              is not a claim in the model, so a disc beside it would assert an
              identity for a page that was never made. */}
          <ul className="tray-rejected-rows row-list">
            {tray.rejected.map((p: Proposal) => (
              <Row as="li" key={p.id} testId={`rejected-${p.id}`}>
                <s>{p.title}</s>
                <span className="tray-rejected-why">{p.reason}</span>
              </Row>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
