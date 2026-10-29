/**
 * "How this was arrived at", at the top of Exports (M38, ISC-500).
 *
 * The header a co-author reads before they take a file. Four counts, every one
 * of them a projection the rest of the app already prints, and each one a link
 * into the record so a reader who wants the events behind a number can go and
 * read them.
 *
 * Nothing here interprets. The numbers do not add up to a verdict on the study
 * and the header does not offer one: `views/exportHeader.ts` says why the
 * drafted-against-typed split is the interesting pair and this draws it.
 */

import { censusRead, censusShare } from "../../ontology/attribution.ts";
import { countOf } from "../format.ts";
import { openRecord } from "../routes.ts";
import { ARRIVED_KINDS, type ExportHeaderView } from "../../views/exportHeader.ts";
import type { LedgerEventType } from "../../ledger/events.ts";

/**
 * One count, with the way into the events behind it.
 *
 * `kinds` is what the number is counting (D51, M43d). The page's own sentence
 * promises "Press a count to open the record at the entries it counts", and the
 * walk of 2026-09-13 pressed "9 findings" and got `EVENTS 1447 · SHOWN 1447`. The
 * record's filter row is still the reader's once they are in it; this decides
 * which kinds are on when it opens.
 */
function IntoTheRecord(props: {
  projectId: string;
  label: string;
  value: string;
  testId: string;
  kinds: readonly LedgerEventType[];
}) {
  const { label, value, testId, kinds } = props;
  return (
    <div className="arrived-row">
      <dt>{label}</dt>
      <dd>
        {/* A button, not an anchor: the record is a dialog over whatever tab is
            showing (M38, ISC-494), opened by the one event routes.ts names, so
            there is no href for it to carry. The two builders wrote this seam
            from opposite sides; the chrome's side won at the merge because it
            is the side that draws the panel. */}
        <button
          type="button"
          className="linkish"
          data-testid={testId}
          onClick={() => openRecord({ kinds })}
        >
          {value}
        </button>
      </dd>
    </div>
  );
}


export function HowArrived(props: { projectId: string; view: ExportHeaderView }) {
  const { projectId, view } = props;
  return (
    <section className="arrived" data-testid="how-arrived">
      <h2 className="arrived-title">Design history</h2>
      {/* M62, ISC-600: The section's lede moved into the page's Help control (ui/pageHelp.ts). */}
      <dl className="arrived-rows">
        <IntoTheRecord
          projectId={projectId}
          label="Messages in your conversations"
          value={countOf(view.turns, "turn")}
          testId="arrived-turns"
          kinds={ARRIVED_KINDS.turns ?? []}
        />
        <IntoTheRecord
          projectId={projectId}
          label="Answers suggested from chat"
          value={`${view.draftedAnswers} of ${view.draftedAnswers + view.typedAnswers}`}
          testId="arrived-drafted"
          kinds={ARRIVED_KINDS.drafted ?? []}
        />
        <IntoTheRecord
          projectId={projectId}
          label="Answers that you typed yourself"
          value={`${view.typedAnswers} of ${view.draftedAnswers + view.typedAnswers}`}
          testId="arrived-typed"
          kinds={ARRIVED_KINDS.typed ?? []}
        />
        <IntoTheRecord
          projectId={projectId}
          label="Claim origins"
          /* M78a, ISC-680: a placed statement is a claim since M75, so a project
             whose claims are statements counts them here. */
          value={
            view.claims.population === 0 && view.placedStatements > 0
              ? countOf(view.placedStatements, "placed statement")
              : censusRead(view.claims)
          }
          testId="arrived-claims"
          kinds={ARRIVED_KINDS.claims ?? []}
        />
      </dl>
      {/* The one sentence a reader needs about the pair above, and it is a fact
          rather than a reading: the share is on the record and the census line
          on Your model prints the same one. */}
      {view.claims.population > 0 && (
        <p className="small muted" data-testid="arrived-model-share">
          Abductive suggested {censusShare(view.claims, "model-proposed")}. You accepted each one.
        </p>
      )}
    </section>
  );
}
