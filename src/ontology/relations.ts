/**
 * The puzzle→theory relation and its evidentiary obligations (ISC-20, ISC-21).
 *
 * The relation between the substantive tension and the state of theory *is*
 * the framing decision. A tension does not only contradict theory — it can
 * instantiate a division already present in the literature, expose a conflict
 * inside a theory that nobody had noticed, or fall where theory is silent.
 * Those are different claims with different burdens, and choosing between
 * them is the most consequential and most path-dependent move in a design.
 *
 * Each relation therefore carries an obligation the ontology must discharge.
 * The checks here are *structural proxies* — graph shape standing in for a
 * judgement — deliberately, so they can run continuously and for free. The
 * semantic versions (is the deviation really systematic? does the field
 * actually care?) live in the lint layer and cost inference.
 *
 * `exposes` is the strongest claim, the most flattering to the researcher,
 * and the easiest to tell a plausible story about without evidence. Its
 * burden is set strictly above the others on purpose (ISC-21): if the tool
 * has a thumb on the scale, it should press against the claim that most
 * rewards over-reaching, not with it.
 */

import type { OntologyGraph, PuzzleRelation } from "./schema.ts";
import { countOf, pluralise } from "../ui/format.ts";
// The four words for an origin, out of the module that owns them: an option on
// the chooser says where its expectation came from, and a fifth spelling of
// "from the papers" on that list is the defect that module exists to end.
import { originLabel } from "../ui/originVocabulary.ts";
import { edgesFrom, edgesInto, pagesOfType } from "./schema.ts";
import type { OntologyPage } from "./schema.ts";
import { documentCount } from "../ui/materialVocabulary.ts";

/**
 * Evidentiary burden, ordinal. Higher demands more before the claim stands.
 * Used for the ISC-21 ordering assertion and to sort unmet obligations so the
 * heaviest unmet claim surfaces first.
 */
export const RELATION_BURDEN: Readonly<Record<PuzzleRelation, number>> = {
  silent: 1,
  instantiates: 2,
  contradicts: 3,
  exposes: 4,
};

export interface ObligationResult {
  readonly relation: PuzzleRelation;
  readonly puzzleId: string;
  readonly theoryId: string;
  readonly discharged: boolean;
  /** What the claim owes, as one sentence, for a surface that wants one. */
  readonly requirement: string;
  /** The same, as a noun phrase, for a surface that writes its own frame. */
  readonly owed: string;
  /** What would discharge it. */
  readonly evidence: string;
  /** Why it is or is not discharged, naming what is missing. */
  readonly detail: string;
  readonly burden: number;
}

/**
 * Which document each passage came from (M29, E3).
 *
 * `contradicts` promises the researcher "more than one source document" and
 * counted chunk ids, so two passages of one interview discharged it. A page
 * knows its passages and a passage knows its document; the graph does not carry
 * the second half, so it is passed in.
 *
 * A caller that has the corpus to hand should pass it. A caller that does not
 * gets the pre-M29 reading, where every passage counts as its own source, which
 * is why `checkAllObligations` takes it too: the fix is only real on the
 * surfaces that supply it.
 */
export type ChunkDocuments = ReadonlyMap<string, string>;

/** The map, built from the corpus. One definition, so no surface builds its own. */
export function chunkDocuments(
  chunks: readonly { readonly id: string; readonly documentId: string }[],
): ChunkDocuments {
  return new Map(chunks.map((c) => [c.id, c.documentId]));
}

/**
 * A detail as a sentence rather than as a label's tail (M28 r6).
 *
 * Every `detail` used to be rendered after "So far:" or "You have it:", so the
 * ones assembled from clauses could start lower-case. The label is gone, on all
 * three surfaces that print a detail, so the first letter has to carry.
 */
function capitalise(text: string): string {
  return text === "" ? text : `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

/** The document a passage came from, or the passage itself when unknown. */
function documentOf(chunkId: string, documents: ChunkDocuments | undefined): string {
  return documents?.get(chunkId) ?? chunkId;
}

export interface ObligationSpec {
  readonly relation: PuzzleRelation;
  /**
   * What the claim owes, as a noun phrase (M28 r6).
   *
   * Split out of `requirement`, which was one sentence in two halves joined by
   * a colon: "Show the deviation is systematic rather than anecdotal: at least
   * two independent observations…". The band printed a fixed lead in front of
   * it, so a researcher read "That claim owes you this. Show the deviation is
   * systematic…", which is three sentences to say one thing. The two halves
   * were always there; naming them lets the band write one flowing sentence
   * and lets `requirement` stay a sentence for the surfaces that want one.
   */
  readonly owed: string;
  /** What would discharge it, as the phrase that follows the colon. */
  readonly evidence: string;
  readonly check: (
    graph: OntologyGraph,
    puzzleId: string,
    theoryId: string,
    documents?: ChunkDocuments,
  ) => { readonly discharged: boolean; readonly detail: string };
}

/** Observation pages that evidence a given puzzle. */
function observationsFor(graph: OntologyGraph, puzzleId: string): readonly string[] {
  return edgesInto(graph, puzzleId, "evidences")
    .map((e) => e.from)
    .filter((id) => graph.pages.get(id)?.type === "observation");
}

/**
 * What the reader has, when fewer than two observations evidence this puzzle
 * (D33, M43c).
 *
 * Three states and three sentences, because the way out of each is different.
 * With no observation in the model at all, the researcher has to read some
 * material or answer a question. With observations that are attached to something
 * else, or to nothing, they have to say which of them bears on this puzzle. With
 * exactly one attached, they need a second from a second document.
 *
 * Self-contained, in fact as well as in form: the band prints the evidence clause
 * in front of this, and the reviewer line and the move rationale print it alone,
 * so a sentence opening on "none" would refer to nothing on two of the three
 * surfaces.
 */
function unattachedDetail(graph: OntologyGraph, attached: number): string {
  if (attached === 1) {
    return "You have attached one observation to this puzzle, and one instance reads as an unusual case";
  }
  const held = pagesOfType(graph, "observation").length;
  if (held === 0) {
    return "Observations in your ontology are still to come, so a single instance looks like an unusual case";
  }
  /* Two ways out since M44, and the sentence names both. The one it named was
   * the only one that existed: answer the tool's question and the accept writes
   * the edge. The researcher can now attach an observation by hand, so a sentence
   * offering the single route would be telling them to go and answer a question in
   * order to do a thing they can do where they are standing. No place is named,
   * because this detail is printed on three surfaces: the band on Your model, the
   * reviewer line beside it, and the move rationale on Design. */
  return `Your ontology has ${countOf(held, "observation")}, and you have attached none of those observations to this puzzle. Attach one of those observations to the puzzle yourself, with the control on this flag`;
}

/*
 * ── Attaching an observation by hand (D29, M44) ──────────────────────────────
 *
 * Links arose from the expectation chooser and from "Add a rival" and from
 * nowhere else, so a researcher with thirteen observations in their model and a
 * puzzle that none of them was attached to had no way to say which ones bear on
 * it. The owes-check said so accurately and the sentence read as an accusation:
 * "none of your 13 observations is attached to this puzzle", with no control on
 * any screen that would attach one.
 *
 * The control the owner chose is this narrow on purpose. `evidences` is one of
 * nine roles in `relationGlossary.ts`, and it is the only one of the nine that an
 * obligation in this file reads: `contradicts` counts observations evidencing the
 * puzzle, `instantiates` counts resolutions resolving it, `silent` counts residues
 * in tension with it, and `exposes` counts the first of those plus a
 * `tensions-with` edge between two expectations. A general relation picker would
 * offer seven roles that no obligation is written for, which is a structure the
 * map's key already advertises and nothing in the engine reads, so the researcher
 * would be drawing lines the checks cannot price. The M43c report on D29 says the
 * same thing and recommends this step: attach an observation to the claim it
 * supports, through the door that already writes relations, priced the way the
 * chooser prices a relation.
 *
 * No new obligation comes with it. What changes is that the pattern `contradicts`
 * has always owed can now be assembled by hand as well as by answering the tool's
 * question.
 */

/** Whether a claim of this kind is one an observation can be evidence for. */
export function takesEvidence(page: OntologyPage): boolean {
  /* The puzzle and the explanation, which are the two the obligations read: a
   * puzzle for `contradicts` and `exposes`, an explanation for the rival and
   * resolution checks that hang off it. An observation evidencing another
   * observation, or evidencing an expectation, is a line no check prices. */
  return page.type === "puzzle" || page.type === "candidate-resolution";
}

/**
 * The observations in the model that are not yet evidence for this claim.
 *
 * Ordered as the model holds them, which is creation order, so the list does not
 * reshuffle between one reading and the next. An observation already attached is
 * absent rather than shown as done: the card lists what this claim is attached to
 * a few lines below, and a picker whose entries do nothing is a picker a reader
 * has to test by pressing.
 */
export function observationsOnOffer(
  graph: OntologyGraph,
  claimId: string,
): readonly OntologyPage[] {
  const attached = new Set(observationsFor(graph, claimId));
  return pagesOfType(graph, "observation").filter((page) => !attached.has(page.id));
}

/**
 * What attaching costs and what it pays, in one sentence (M44).
 *
 * The chooser shows the price of a relation before the researcher picks one, and
 * this control is held to the same rule: the researcher reads what the act does
 * to the checks before they press. What it does is exactly what `contradicts`
 * counts, which is the observation and the documents behind it.
 */
export const ATTACH_PRICE =
  "Attaching an observation counts it, and the documents that it cites, towards what this claim owes you.";

/** One observation as the picker's own control reads: the title, then its passages. */
export function attachOffer(page: OntologyPage): string {
  const cites = page.supportingChunks.length;
  return cites === 0
    ? `"${page.title}" doesn't cite a passage yet`
    : `"${page.title}" cites ${cites} ${pluralise(cites, "passage")}`;
}

/** Candidate resolutions attached to a puzzle. */
function resolutionsFor(graph: OntologyGraph, puzzleId: string): readonly string[] {
  return edgesInto(graph, puzzleId, "resolves")
    .map((e) => e.from)
    .filter((id) => graph.pages.get(id)?.type === "candidate-resolution");
}

const SPECS: Readonly<Record<PuzzleRelation, ObligationSpec>> = {
  /**
   * Anomaly. Zuckerman's worry about the found puzzle is that a pattern from
   * one case gets dismissed as a weird case, so the burden is breadth of
   * evidence rather than depth of argument.
   */
  contradicts: {
    relation: "contradicts",
    /* M42. "a systematic deviation: at least two independent observations from
     * more than one source document" made a reader ten minutes in translate three
     * terms before they could act. The burden is unchanged; the words are the ones
     * the rest of the tool uses for passages and documents. */
    owed: "a pattern rather than a single instance",
    evidence: "at least two observations from two different documents of your data",
    check: (graph, puzzleId, _theoryId, documents) => {
      const obs = observationsFor(graph, puzzleId);
      /*
       * Documents, not passages (M29, E3).
       *
       * This built its set out of chunk ids, so two quotes from the same
       * interview passed a check whose own requirement, printed to the
       * researcher one line above the result, promises more than one source
       * document. The whole point of the burden is breadth: Zuckerman's worry
       * about a found puzzle is that a pattern from one case gets dismissed as
       * a weird case, and two passages of one transcript is one case.
       */
      const sources = new Set<string>();
      for (const id of obs) {
        for (const chunk of graph.pages.get(id)?.supportingChunks ?? []) {
          sources.add(documentOf(chunk, documents));
        }
      }
      if (obs.length < 2) {
        return {
          discharged: false,
          /* M28 r6: it printed "only 0 observation(s) evidence this puzzle",
           * which is a parenthesised plural and a verb that does not agree, in
           * a sentence a researcher reads on the argument band. Two states, and
           * each one says plainly what the reader has. */
          /*
           * D33 (M43c). It read "You have no such observations yet" while the
           * model held thirteen observations, one of them citing three separate
           * documents by passage id, every one of them drafted by the tool out of
           * the researcher's own material. The check was right and the sentence
           * was false: `observationsFor` counts observations joined to this puzzle
           * by an `evidences` edge, and nothing the researcher had done made one.
           *
           * The rule does not move. Breadth of evidence for *this* puzzle is what
           * `contradicts` owes, and an observation sitting in the model unattached
           * has not been offered as evidence for anything. What moves is that the
           * sentence says which of the two silences it is, and names the way out
           * of the second, the way the `silent` spec below already does for a
           * residue. Answering the question the tool raises for this claim is that
           * way: `proposals/obligations.ts` points the observation it drafts from
           * that answer at this puzzle, so the link is written by the accept.
           */
          detail: unattachedDetail(graph, obs.length),
        };
      }
      /*
       * Nothing cited at all, said as that rather than as "0 documents" (M42).
       *
       * The band printed "You have 2 observations, but they all come from 0
       * documents, so the deviation rests on one source" on the owner's screen.
       * Two observations that cite no passage come from no document, so the
       * sentence counted correctly and then said something false about what it
       * counted: there is no source for the pattern to rest on. The two states
       * need two sentences, because the way out of them is different. With one
       * document you need a second; with none you need a passage.
       */
      if (sources.size === 0) {
        return {
          discharged: false,
          detail: `You have ${obs.length} observations, and none of those observations cites a passage of your data, so the pattern lacks an anchor in your data`,
        };
      }
      if (sources.size < 2) {
        return {
          discharged: false,
          detail: `You have ${obs.length} observations from ${documentCount(sources.size)}, so the pattern rests on one source`,
        };
      }
      return {
        discharged: true,
        detail: `You have ${obs.length} observations across ${documentCount(sources.size)}`,
      };
    },
  },

  /**
   * The field tension exhibits a division already present in the literature.
   * Showing an instance of a known split is not a contribution on its own.
   * The burden is a mechanism, grounded in data, that the literature did not
   * already anticipate.
   */
  instantiates: {
    relation: "instantiates",
    owed: "a mechanism the papers do not already account for",
    evidence: "at least one candidate resolution grounded in your data",
    check: (graph, puzzleId) => {
      const resolutions = resolutionsFor(graph, puzzleId);
      const grounded = resolutions.filter(
        (id) => (graph.pages.get(id)?.supportingChunks.length ?? 0) > 0,
      );
      if (grounded.length === 0) {
        return {
          discharged: false,
          detail:
            resolutions.length === 0
              ? "You have not proposed how anyone navigates the tension"
              : `You have ${countOf(resolutions.length, "candidate resolution")}, and none of those resolutions cites your data`,
        };
      }
      return {
        discharged: true,
        detail: `You have ${countOf(grounded.length, "resolution")} grounded in your data`,
      };
    },
  },

  /**
   * The case reveals a conflict inside theory that nobody had noticed. The
   * heaviest burden, and all three parts are required: the conceptual conflict
   * has to be represented as a relation between theories, the field evidence
   * has to show actors running aground on it, and there has to be a
   * consequence — otherwise the field can acknowledge the tension with a
   * shrug, and a shrug is not a contribution.
   */
  exposes: {
    relation: "exposes",
    owed: "consequences for the tension that you have identified",
    evidence:
      "a link between the two expectations, at least two observations of people running aground on it, and a scope condition or resolution that follows",
    check: (graph, puzzleId, theoryId) => {
      const missing: string[] = [];

      const theoryTensions = [
        ...edgesFrom(graph, theoryId, "tensions-with"),
        ...edgesInto(graph, theoryId, "tensions-with"),
      ];
      if (theoryTensions.length === 0) {
        missing.push("you have not linked the two expectations that pull against each other");
      }

      const obs = observationsFor(graph, puzzleId);
      if (obs.length < 2) {
        /* D33 (M43c), one row down. The same count, and the same sentence saying
         * the researcher has nothing when what is true is that nothing is
         * attached to this puzzle. Said the same way here, in the clause form this
         * three-part burden assembles. */
        const held = pagesOfType(graph, "observation").length;
        missing.push(
          obs.length === 0
            ? held === 0
              ? "you have not shown anyone running aground on that expectation"
              : `you attached your ${countOf(held, "observation")} to other claims, not to this puzzle`
            : "you have shown one person running aground on that expectation, which reads as a single case",
        );
      }

      const consequences =
        resolutionsFor(graph, puzzleId).length +
        edgesInto(graph, puzzleId, "bounds").filter(
          (e) => graph.pages.get(e.from)?.type === "scope-condition",
        ).length;
      if (consequences === 0) {
        missing.push("the exposure's consequence is still to come: a scope condition or a resolution");
      }

      return missing.length === 0
        ? {
            discharged: true,
            detail: `You have linked the two expectations, ${obs.length} observations, and something that follows from them`,
          }
        : {
            discharged: false,
            /* M28 r6: a sentence, not a label's tail. The frame that printed
             * "So far:" in front of every detail is gone, so the first clause
             * has to open the sentence itself. */
            detail: capitalise(missing.join("; ")),
          };
    },
  },

  /**
   * Theory makes no prediction either way. Usually a pseudo-genre in
   * disguise, so the burden is an account of why the silence is a problem —
   * which in ontology terms means naming what the silence leaves unexplained.
   */
  silent: {
    relation: "silent",
    owed: "a reason the silence matters",
    evidence: "at least one unexplained thing that stays unexplained because the papers are silent here",
    check: (graph, puzzleId) => {
      const residues = edgesInto(graph, puzzleId).filter(
        (e) => graph.pages.get(e.from)?.type === "analytic-residue",
      );
      if (residues.length > 0) {
        return {
          discharged: true,
          detail: `You have ${countOf(residues.length, "thing")} the papers leave unexplained`,
        };
      }
      /*
       * Two different failures wore one sentence (walk item 4).
       *
       * The check counts residues linked to this puzzle, and nothing in the
       * product wrote that link, so a study with a full residue panel read
       * "Nothing here is left unexplained" three inches under a band saying
       * "Your account cannot explain 2 things". The researcher is told their
       * study has no gap and told the size of the gap, on one screen.
       *
       * The undischarged state now says which of the two it is. Nothing
       * unexplained at all is one finding; unexplained things that are not
       * attached to this puzzle is a different one, and the second is fixable
       * in a click, which is why it names the act.
       */
      const loose = pagesOfType(graph, "analytic-residue");
      if (loose.length === 0) {
        return {
          discharged: false,
          detail:
            "Your ontology explains everything here, so the papers' silence leaves you without a reason to run the project",
        };
      }
      const one = loose.length === 1;
      return {
        discharged: false,
        /* ProseCodex batch 2, item 37: the count moved after the verb, which
         * deletes the `is`/`are` branch rather than only rewording the string.
         * "Your model contains" agrees at one and at many, so the only choice
         * left is the one English still needs, between "it" and "none". */
        detail: `Your ontology contains ${countOf(loose.length, "unexplained thing")}, but ${
          one ? "it is not" : "none is"
        } linked to this puzzle. Link ${one ? "it" : "one"}.`,
      };
    },
  },
};

/**
 * The expectations a puzzle may be said to break (walk item 2).
 *
 * A theory page whose origin says where the expectation came from: out of a
 * paper, or out of the researcher's own stated prior. Those are the two kinds
 * of thing a setting can break, because both are claims somebody held before
 * the study looked.
 *
 * What is excluded is a theory page the model drafted out of the researcher's
 * own material. The live walk found two of them in the chooser, offered as the
 * expectation the puzzle broke: a study would then be breaking its own reading
 * of its own transcript and calling that a contribution. `extract.ts` no longer
 * drafts them, and this is the second gate, because a study built before that
 * change still has them in its model and the chooser must not offer those
 * either.
 */
/**
 * Whether the researcher has said this expectation is held by people in the
 * setting (M44).
 *
 * The holder is the mark: `heldBy` is written by a `mark` mutation and by nothing
 * else, so its presence is the fact and the string is who holds it.
 */
export function heldInSetting(page: OntologyPage): boolean {
  return page.heldBy !== undefined && page.heldBy.trim() !== "";
}

export function expectationsOnOffer(graph: OntologyGraph): readonly OntologyPage[] {
  return pagesOfType(graph, "theory").filter(
    (page) =>
      page.origin === "literature-derived" ||
      page.origin === "author-prior" ||
      /*
       * An expectation held in the setting, whoever typed it in (M44, owner's
       * decision of 2026-09-13).
       *
       * The exclusion above stands for what it was written for. What it also kept
       * out is a board paper's stated aim, a policy, a programme's promise: a
       * claim somebody in the setting held before the study looked, which is
       * exactly the kind of thing a puzzle can break. On the walk of 2026-09-13
       * the most documented expectation anyone in Coldharbour held was in the
       * model as an expectation and could not be chosen, so two checks told the
       * researcher their puzzle was paired with the wrong expectation and the
       * right one was unreachable.
       *
       * The mark is the researcher's act and carries who holds it, so this gate
       * turns on a sentence somebody typed rather than on a reading the tool
       * made. A model-proposed expectation nobody has marked stays off the list.
       */
      heldInSetting(page),
  );
}

/**
 * How an expectation on the chooser's list says where it comes from (M44).
 *
 * Origin first, in the words `originVocabulary.ts` owns, because whose
 * expectation it is remains the thing a reader needs. The holder follows when the
 * researcher has marked one, so the option reads "from the papers" or "held in
 * the setting by the board, in the January paper", and the two facts sit in one
 * phrase rather than in two columns the reader has to join.
 *
 * The obligations do not move with it. Every `check` in `SPECS` above reads the
 * graph's shape, counting observations attached to the puzzle, the documents they
 * cite, residues, resolutions and the tension edge between two expectations. Not
 * one of them looks at `origin`, at `paperKey` or at `heldBy`, so `contradicts`
 * owes a marked expectation exactly what it owes a paper's: two observations from
 * two different documents.
 */
export function expectationSource(page: OntologyPage): string {
  return heldInSetting(page)
    ? `held in the setting by ${page.heldBy ?? ""}`
    : originLabel(page.origin);
}

/** The same fact as a sentence, for a card and a row rather than a list. */
export function heldInSettingLine(page: OntologyPage): string {
  return `This expectation is held in the setting by ${page.heldBy ?? ""}.`;
}

/** Evaluate one relation claim against the current graph. */
/**
 * The obligations, each with its sentence derived from its two halves.
 *
 * `owed` and `evidence` are declared once in `SPECS` below and the sentence is
 * built from them here, so a surface that writes its own frame and a surface
 * that wants a whole sentence cannot drift apart. Before this the sentence was
 * the declaration and the argument band had to print a fixed lead in front of
 * it, which is how "That claim owes you this. Show the deviation is systematic
 * rather than anecdotal: …" reached the screen.
 */
export const OBLIGATIONS: Readonly<Record<PuzzleRelation, ObligationSpec & { requirement: string }>> =
  Object.fromEntries(
    (Object.keys(SPECS) as PuzzleRelation[]).map((relation) => {
      const spec = SPECS[relation];
      return [relation, { ...spec, requirement: `Show ${spec.owed}: ${spec.evidence}.` }];
    }),
  ) as Readonly<Record<PuzzleRelation, ObligationSpec & { requirement: string }>>;


export function checkObligation(
  graph: OntologyGraph,
  puzzleId: string,
  theoryId: string,
  relation: PuzzleRelation,
  documents?: ChunkDocuments,
): ObligationResult {
  const spec = OBLIGATIONS[relation];
  const { discharged, detail } = spec.check(graph, puzzleId, theoryId, documents);
  return {
    relation,
    puzzleId,
    theoryId,
    discharged,
    requirement: spec.requirement,
    owed: spec.owed,
    evidence: spec.evidence,
    detail,
    burden: RELATION_BURDEN[relation],
  };
}

/**
 * Evaluate every relation claim in the graph, heaviest unmet burden first —
 * so the claim most likely to be over-reaching is the one the researcher sees.
 */
export function checkAllObligations(
  graph: OntologyGraph,
  documents?: ChunkDocuments,
): readonly ObligationResult[] {
  return graph.relations
    .map((claim) =>
      checkObligation(graph, claim.puzzleId, claim.theoryId, claim.relation, documents),
    )
    .sort((a, b) => {
      if (a.discharged !== b.discharged) return a.discharged ? 1 : -1;
      return b.burden - a.burden;
    });
}

/**
 * Whether the ontology contains a theory page carrying an expectation for a
 * given puzzle. In an obscured-puzzle design this node does the argumentative
 * work, and its absence is the most common structural weakness — hence a
 * dedicated reader rather than an inline check.
 */
export function hasExpectationFor(graph: OntologyGraph, puzzleId: string): boolean {
  if (graph.relations.some((r) => r.puzzleId === puzzleId)) return true;
  const theoryIds = new Set(pagesOfType(graph, "theory").map((p) => p.id));
  return (
    edgesInto(graph, puzzleId).some((e) => theoryIds.has(e.from)) ||
    edgesFrom(graph, puzzleId).some((e) => theoryIds.has(e.to))
  );
}
