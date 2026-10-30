/**
 * Model text with its passage codes as labels (M96b, ISC-796).
 *
 * `CitationProvider` sits round a project's routes and holds which file each
 * passage came from; `Cited` draws a string with every `[[chunk:…]]` code as a
 * link to the passage on Sources, or, for a file that has gone, as a plain label
 * saying so. The stored text keeps the code.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { listChunks, listDocuments } from "../state/projects.ts";
import { useStudyFreshness } from "../state/useStudyFreshness.ts";
import { citationSegments, passageLookup, type PassageLookup } from "../views/citations.ts";
import { passagePath } from "./routes.ts";

interface Citations {
  readonly projectId: string;
  /** Undefined while the passages load. */
  readonly lookup: PassageLookup | undefined;
}

const CitationContext = createContext<Citations | null>(null);

export function CitationProvider(props: { readonly projectId: string; readonly children: ReactNode }) {
  const { projectId } = props;
  const [lookup, setLookup] = useState<PassageLookup | undefined>(undefined);
  const load = useCallback(() => {
    let cancelled = false;
    void Promise.all([listChunks(projectId), listDocuments(projectId)])
      .then(([chunks, documents]) => {
        if (!cancelled) setLookup(passageLookup(chunks, documents));
      })
      .catch(() => {
        if (!cancelled) setLookup(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  useEffect(() => load(), [load]);
  useStudyFreshness(projectId, () => void load());
  return <CitationContext.Provider value={{ projectId, lookup }}>{props.children}</CitationContext.Provider>;
}

/** Provide a lookup directly, for a surface that already holds the passages. */
export function CitationScope(props: { readonly projectId: string; readonly lookup: PassageLookup; readonly children?: ReactNode }) {
  return (
    <CitationContext.Provider value={{ projectId: props.projectId, lookup: props.lookup }}>{props.children}</CitationContext.Provider>
  );
}

export function useCitations(): Citations | null {
  return useContext(CitationContext);
}

/** One string of model text, with its passage codes as labels. */
export function Cited(props: { readonly text: string }) {
  const citations = useCitations();
  const parts = citationSegments(props.text, citations?.lookup);
  if (parts.length === 1 && parts[0]?.kind === "text") return <>{props.text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : p.known && citations !== null ? (
          <a key={i} className="cite-label" href={passagePath(citations.projectId, p.id)} data-testid="cite-label">
            {p.label}
          </a>
        ) : (
          <span key={i} className="cite-label cite-removed" data-testid="cite-label">
            {p.label}
          </span>
        ),
      )}
    </>
  );
}
