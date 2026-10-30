/**
 * The line at the top of Early data (M96, ISC-790).
 *
 * The owner, 2026-10-30: "the early data discussion should consider all of the
 * data that has been uploaded as context." The line names how many data files
 * the conversation considers and links to Sources, where the files are; when a
 * corpus goes past the budget, a second line names the files left out, so the
 * conversation never drops a file without the researcher seeing which.
 */

import { numberWord } from "../concepts/vocabulary.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { studyPath } from "../ui/routes.ts";
import { earlyDataScope } from "./earlyData.ts";

/** "one data file" or "four data files". */
function files(n: number): string {
  return `${numberWord(n)} data ${n === 1 ? "file" : "files"}`;
}

/** "a.txt", "a.txt and b.txt", "a.txt, b.txt and c.txt". */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The sentence the line prints, exported for the tests and the help prompt. */
export function earlyDataScopeSentence(considered: number, total: number): string {
  return considered === total
    ? `This step considers your ${files(total)} on Sources, in full.`
    : `This step considers ${numberWord(considered)} of your ${files(total)} on Sources, in full.`;
}

export function EarlyDataScopeLine(props: {
  readonly projectId: string;
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
}) {
  const { projectId, documents, chunks } = props;
  const scope = earlyDataScope(documents, chunks);
  const total = scope.considered.length + scope.leftOut.length;
  return (
    <div className="early-data-scope" data-testid="early-data-scope">
      <p className="small muted">
        {earlyDataScopeSentence(scope.considered.length, total)}{" "}
        <a href={studyPath(projectId, "material")} data-testid="early-data-scope-sources">
          Open Sources
        </a>
      </p>
      {scope.leftOut.length > 0 && (
        <p className="small muted" data-testid="early-data-scope-left-out">
          {`Abductive excludes ${listed(scope.leftOut.map((d) => d.name))} from the conversation, because your data is longer than the limit for one conversation.`}
        </p>
      )}
    </div>
  );
}
