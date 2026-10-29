/**
 * The answer to "what in your material shows that", attached to the claim it
 * was asked for (M35, D7).
 *
 * What the walk found on 2026-09-09. The researcher recorded through the
 * chooser that their puzzle contradicts an expectation. The argument band then
 * said the claim owes "a systematic deviation: at least two independent
 * observations from more than one source document. You have no such
 * observations yet", and offered the one control that pays it: answer the
 * question the interview raises for that obligation. They answered with three
 * documents, the drafter produced an observation, and they took it into the
 * model. It landed with links "none", and the band still read "You have no such
 * observations yet". There is no manual link control on the page. So the only
 * route the tool offers to discharge the debt produced claims that could not
 * count toward it.
 *
 * Why an edge here is not the decision ISC-443 is holding. That one is about an
 * observation drafted from a baseline answer, where the question asks what fits
 * the expectation *and* what breaks it, so the answer may be either and the two
 * take opposite edges: choosing for the researcher would be the tool making the
 * framing decision the chooser exists to put to them. Nothing here is
 * ambiguous. The researcher has already made the framing decision, the question
 * exists only because they made it, and it asks for what shows the deviation.
 * `evidences` from an observation to that puzzle is the reading of "here is
 * what shows it", and it is the reading `observationsFor` in
 * `ontology/relations.ts` already counts. The same ground the M33 `bounds` link
 * stands on: the question asked exactly that, so the link asserts nothing the
 * researcher did not say.
 *
 * Nothing is asserted until the researcher accepts the draft, and the accept
 * still goes through `adjudicate.ts`, which stays the only writer of an
 * ontology mutation.
 */

import type { ProposalEvent } from "../ledger/events.ts";

const PREFIX = "obligation:";
const SEPARATOR = "~";

/** The topic the interview asks an unmet relation obligation under. */
export function obligationTopic(puzzleId: string, theoryId: string): string {
  return `${PREFIX}${puzzleId}${SEPARATOR}${theoryId}`;
}

/**
 * The claim a topic is about, or undefined when the topic is not one.
 *
 * The pair is already in the topic, which is why nothing here reads the
 * question's text: the move that raises it writes the two page ids in, and this
 * reads them back. A separator that cannot appear in an id, so a title with a
 * tilde in it cannot split the wrong way.
 */
export function obligationOfTopic(
  topic: string,
): { readonly puzzleId: string; readonly theoryId: string } | undefined {
  if (!topic.startsWith(PREFIX)) return undefined;
  const parts = topic.slice(PREFIX.length).split(SEPARATOR);
  if (parts.length !== 2) return undefined;
  const [puzzleId, theoryId] = parts;
  if (puzzleId === undefined || puzzleId === "" || theoryId === undefined || theoryId === "") {
    return undefined;
  }
  return { puzzleId, theoryId };
}

/* M63 (the lead's ruling): `attachToObligation` retired with the per-claim wiring. An
   answer to the question now attaches its observation as a statement under the
   concept, through `concepts/door.ts` (`answerLineEvents`). */
