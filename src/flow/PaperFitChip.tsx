/**
 * What has happened to one paper, as a chip (M29c, rewritten M51 at ISC-533).
 *
 * It carried the verdict: "fits your setting", "unclear", "doesn't fit", in
 * green for the first and amber for the other two. A co-author read that pair
 * of words beside their own reading list on 2026-09-21 and told the owner the tool
 * was "being too self-confident". The owner's decision of 2026-09-26 is that no
 * verdict reaches the researcher at all, so the three words are gone from here,
 * which is the one place every surface drew them from.
 *
 * What is left is the distinction the chip was built for and the verdict was
 * only ever a proxy for: whether anything has read this paper. A paper with no
 * notice beside it used to look exactly like a paper that had passed, and a
 * paper nobody had read looked the same as one the tool had nothing to say
 * about. So the states are the acts, in the order they happen, and none of them
 * is an opinion about the paper.
 *
 * `notice` is left on one state only, the file nothing could be read out of,
 * because that one is a fact about the upload rather than about the reading. A
 * paper the tool has read carries no tone: there is nothing here for the
 * researcher to be reassured or warned about, and what the reading found is on
 * the row underneath in words.
 */

import { StatusChip } from "../ui/components/index.ts";

/**
 * Everything a paper can be, from the row's point of view (walk items 3 and 4).
 *
 * Four states, where there were seven: the three verdicts collapse into `read`,
 * because the reading is the fact and the verdict is what the tool does with it.
 * A judged paper still says something different from an unread one, which is the
 * silence the chip exists to break.
 */
/* M78a, ISC-678: "named" is a paper typed by its citation, with no text behind
 * it. It is never read, so a verdict an older project holds for it does not turn
 * the chip into Read. */
export type PaperFitState = "read" | "reading" | "judging" | "unjudged" | "unreadable" | "named";

const STATE_LABEL: Readonly<Record<PaperFitState, string>> = {
  read: "Read",
  reading: "Reading",
  judging: "Reading",
  unjudged: "Unread",
  unreadable: "Unreadable",
  named: "Identified",
};

/** Plain for every state but the file that yielded nothing. */
const STATE_TONE: Readonly<Record<PaperFitState, "ok" | "notice" | "neutral">> = {
  read: "neutral",
  reading: "neutral",
  judging: "neutral",
  unjudged: "neutral",
  unreadable: "notice",
  named: "neutral",
};

export function PaperFitChip(props: {
  /**
   * The verdict on the record, when there is one.
   *
   * Still taken, and no longer shown: any of the three means the tool has read
   * the paper, which is what the chip says. The prop keeps its name and its type
   * so every surface that holds a verdict can go on handing it over without
   * knowing what the chip does with it.
   */
  verdict: "fits" | "unclear" | "misfit" | undefined;
  /** What the row is doing, when nothing has read the paper yet. */
  state?: PaperFitState;
}) {
  const state: PaperFitState | undefined =
    props.state === "named" ? "named" : props.verdict === undefined ? props.state : "read";
  if (state === undefined) return null;
  return (
    <StatusChip label={STATE_LABEL[state]} tone={STATE_TONE[state]} testId={`paper-fit-${state}`} />
  );
}
