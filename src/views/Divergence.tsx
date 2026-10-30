/**
 * Divergence view (ISC-28): persona-vs-persona and persona-vs-researcher
 * disagreements, plus surviving dissent highlighted as the candidate-anomaly
 * signal. Renders the pure `computeDivergence` projection of the event array,
 * and no domain state lives here (ISC-29).
 *
 * Same two corrections as FlagPanel, three times over, because this panel has
 * three sections and every one of them was empty on a fresh study.
 *
 * Each heading counted with "(s)" and each section answered empty with one bare
 * sentence in no container. Three bare sentences under three headings reading
 * "(0 cell(s))", "(0 rejection(s))" and "(0)" is what the whole panel amounted
 * to before a single persona had spoken, which is the state a researcher first
 * meets it in. EmptyState is the app's answer to that (FND-09): a statement of
 * what is true, and one thing worth knowing about why the section exists. The
 * teaching lines matter more here than almost anywhere else in the tool,
 * because "surviving dissent" is a term of art and an empty list of it looks
 * like nothing rather than like the absence of something.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import { computeDivergence } from "./divergenceModel.ts";
import { EmptyState } from "../ui/components/index.ts";
import { countOf } from "../ui/format.ts";

function personaName(actor: string): string {
  return actor.replace(/^persona:/, "");
}

export function Divergence(props: { events: readonly LedgerEvent[] }) {
  const report = computeDivergence(props.events);

  return (
    <section className="card">
      <h2>Disagreements</h2>

      <h3>Persona vs persona ({countOf(report.personaVsPersona.length, "cell")})</h3>
      {report.personaVsPersona.length === 0 ? (
        <EmptyState
          status="Abductive has challenged each square of the bias grid with one check at most."
          teach="When two of Abductive's checks argue over the same square of the bias grid, that part of your design is under dispute rather than unexamined."
          testId="divergence-persona-empty"
        />
      ) : (
        report.personaVsPersona.map((group) => (
          <div key={group.matrixCell} className="card">
            <code>{group.matrixCell}</code>{" "}
            <span className="muted">
              {group.personas.map(personaName).join(" vs ")}: conflicting challenges on
              the same cell
            </span>
            {group.challenges.map((challenge) => (
              <p key={challenge.id} style={{ whiteSpace: "pre-wrap" }}>
                <span className="pill">{personaName(challenge.actor)}</span>
                {challenge.text}
              </p>
            ))}
          </div>
        ))
      )}

      <h3>Persona vs researcher ({countOf(report.personaVsResearcher.length, "rejection")})</h3>
      {report.personaVsResearcher.length === 0 ? (
        <EmptyState
          status="You haven't rejected a challenge."
          teach="Rejecting a challenge is a normal choice, and Abductive counts it as a decision. Abductive keeps each of your disagreements with it on this list, with your reason."
          testId="divergence-researcher-empty"
        />
      ) : (
        report.personaVsResearcher.map(({ challenge, reason }) => (
          <div key={challenge.id} className="card">
            <span className="pill">{personaName(challenge.actor)}</span>
            {challenge.matrixCell !== undefined && (
              <span className="pill">{challenge.matrixCell}</span>
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>{challenge.text}</p>
            <p className="muted">
              Researcher rejected{reason !== undefined ? `: ${reason}` : " (without a reason)"}
            </p>
          </div>
        ))
      )}

      <h3>
        Surviving dissent ({report.survivingDissent.length}), candidate-anomaly signal
      </h3>
      {report.survivingDissent.length === 0 ? (
        <EmptyState
          status="You have answered and resolved every challenge."
          // M28 r6: copy. "Unadjudicated" is on the banned list, and the
          // sentence ran 26 words before the reader met anything they do.
          teach="A challenge that you leave standing may hide an anomaly. This list fills as you leave challenges unresolved, rather than as you settle them, so an empty list is normal."
          testId="divergence-dissent-empty"
        />
      ) : (
        <>
          <p className="muted">
            Challenges that you rejected, challenges that Abductive logged as ignored, and challenges
            that are still open. A challenge left unresolved may hide an anomaly, so go through
            these before you settle on an explanation.
          </p>
          {report.survivingDissent.map(({ challenge, status }) => (
            <div key={challenge.id} className="card dissent">
              <span className="pill">{status}</span>
              <span className="pill">{personaName(challenge.actor)}</span>
              {challenge.matrixCell !== undefined && (
                <span className="pill">{challenge.matrixCell}</span>
              )}
              <p style={{ whiteSpace: "pre-wrap" }}>{challenge.text}</p>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
