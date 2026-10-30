/**
 * The emerging project ontology, in the exports (M63, ISC-613).
 *
 * The Report export carries the ontology (each concept with its definition,
 * properties, relations, statements and the passages or answers behind it) and
 * the lines to look for in the field. The latest readiness report followed them
 * until the checks left main at M89 (the owner, 2026-10-14). The figure
 * draws the concept map from the layout the tab draws, so screen and file agree.
 * Pure: every value is a reading of events already written.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { evidenceBehind, evidenceBehindRelation, projectConcepts, type Statement, type WhyLine } from "../concepts/projection.ts";
import { statementLabel, type LabelContext } from "../concepts/statementOrigin.ts";
import { FIGURE_TYPE, conceptMapDrawing, labelLines, labelPlace } from "../concepts/mapLayout.ts";
import {
  ONTOLOGY_GLOSS,
  ONTOLOGY_TAB_LABEL,
  RELATION_PHRASE,
  evidencePhrase,
  numberWord,
  relationSentence,
  stepName,
  CHAT_ORIGIN_LABEL,
} from "../concepts/vocabulary.ts";
import { speakers, suggestionOrigin } from "../concepts/chat.ts";
import type { ConceptSource } from "../ledger/events.ts";
import { conceptWrittenLine } from "../ui/originVocabulary.ts";
import { passageRef } from "../ui/materialVocabulary.ts";
import { COLOUR } from "../ui/tokens.ts";

/** "one suggested concept", "five suggested relations", "17 suggested concepts". */
/**
 * Who wrote the Why it matters lines, said once for the section (M82, the
 * lead's ruling A of 2026-10-04, which set the walk's Report bar at 40 kB).
 * A line then carries a marker only when it is the researcher's or still
 * waits for their decision; History keeps who wrote each one.
 */
export const WHY_SECTION_NOTE =
  "_Abductive wrote each Why it matters line in this section, except a line marked (yours), which you wrote. You haven't decided yet on a line marked (to decide)._";

/**
 * A card's Why it matters line in the Report (M82, ISC-695). A card without a
 * line yet gets none: on the walk's record thirty "still to come" lines pushed
 * the Report past its 30 kB bar.
 */
function whyReportLine(line: WhyLine): string {
  const mark = line.by === "you" ? " _(yours)_" : line.status === "suggested" ? " _(to decide)_" : "";
  return `**Why it matters:** ${line.text}${mark}`;
}

/** M93, ISC-765: a line the researcher rejected leaves the Report. */
function kept(line: WhyLine | null): boolean {
  return line !== null && line.status !== "rejected";
}

/** Whose paragraph the argument is, as the Report labels it (M93, ISC-762). */
const ARGUMENT_ORIGIN: Readonly<Record<"you" | "abductive" | "legacy", string>> = {
  you: "In your words, edited from the paragraph that Abductive wrote from the concepts and relations that you accepted.",
  abductive: "Written by Abductive from the concepts and relations that you accepted, and accepted by you.",
  legacy: "Written by Abductive from the concepts and relations that you accepted.",
};

function toDecide(n: number, noun: "concept" | "relation"): string {
  return n === 1 ? `one suggested ${noun}` : `${numberWord(n)} suggested ${noun}s`;
}

/** The Report's M63 sections, as markdown lines (the readiness report went at M89). */
export function conceptReportLines(
  events: readonly LedgerEvent[],
  projectId: string,
  graph: OntologyGraph,
  labels: LabelContext = { chunks: [], documents: [] },
): readonly string[] {
  const view = projectConcepts(events, projectId, graph);
  /* M75, ISC-669: every statement carries the label of its origin, here as on the tab. */
  const said = (s: Statement) => `- ${statementLabel(s.from, labels)}: ${s.text}`;
  const name = (id: string) => view.concepts.get(id)?.name ?? "a concept";
  const out: string[] = [`## ${ONTOLOGY_TAB_LABEL}`, "", `_${ONTOLOGY_GLOSS}_`, ""];
  if (view.accepted.length === 0) {
    out.push("You haven't accepted a concept yet.", "");
  }
  /* M82: who wrote the Why it matters lines, once for the section, when a card carries one. */
  if ([...view.accepted, ...view.acceptedRelations].some((card) => kept(card.why))) out.push(WHY_SECTION_NOTE, "");
  /* M82, ISC-695: the argument so far. M93, ISC-762: only the paragraph the
     researcher accepted, as written or in their words, labelled by whose it is;
     a paragraph still waiting for a decision stays on the tab. */
  const accepted = view.acceptedArgument;
  if (accepted !== null && view.accepted.length > 0) {
    out.push("### The argument so far", "", accepted.text, "", `_${ARGUMENT_ORIGIN[accepted.by]}_`, "");
  }
  /* M93, ISC-757: whose words a card surfaced from the chat draws on. */
  const who = speakers(events);
  const chatLine = (card: { readonly source?: ConceptSource | { readonly kind: "researcher" }; readonly drawnFrom?: readonly string[] }) => {
    const source = card.source;
    if (source === undefined || source.kind !== "chat") return null;
    const origin = suggestionOrigin({ source, ...(card.drawnFrom === undefined ? {} : { drawnFrom: card.drawnFrom }) }, who);
    return origin === null ? null : `_${CHAT_ORIGIN_LABEL[origin]}, in the chat at ${stepName(source.station)}._`;
  };
  /* M78a, ISC-679 (the lead's ruling (a)): a concept section carries its name,
     definition, defined properties with their variation, its statements and the
     evidence behind it. The walk's Report ran to 42.2 kB, most of it "variation
     not defined yet" lines (the field list carries those), "None yet." lines and
     each relation written out under both its concepts; a relation is now written
     once under Relations, and a concept links to it by name. */
  const relationName = (r: (typeof view.acceptedRelations)[number]) => relationSentence(name(r.from), r.relation, name(r.to));
  const relationIndex = new Map(view.acceptedRelations.map((r, i) => [r.id, i] as const));
  for (const c of view.accepted) {
    out.push(`### ${c.name}`, "");
    /* Whose concept it is stays (M74a, ISC-663): attribution is the point of the file. */
    if (c.origin !== undefined) out.push(`_${conceptWrittenLine(c.origin, c.original !== null)}._`, "");
    const fromChat = chatLine(c);
    if (fromChat !== null) out.push(fromChat, "");
    out.push(c.definition === "" ? "Definition not written yet." : c.definition, "");
    if (c.why !== null && kept(c.why)) out.push(whyReportLine(c.why), "");
    const defined = c.properties.filter((p) => p.varies !== undefined);
    if (defined.length > 0) {
      out.push("**Properties**", "");
      for (const p of defined) out.push(`- ${p.name}: ${p.varies}`);
      out.push("");
    }
    const links = view.acceptedRelations.filter((r) => r.from === c.id || r.to === c.id);
    if (links.length > 0) {
      const linked = links.map((r) => {
        const i = relationIndex.get(r.id) ?? 0;
        return `[R${i + 1}. ${relationName(r)}](#${relationAnchor(i, r, name)})`;
      });
      out.push(`**Relations:** ${linked.join("; ")}`, "");
    }
    const placed = c.statementIds.map((id) => view.statements.get(id)).filter((x): x is Statement => x !== undefined);
    if (placed.length > 0) {
      out.push("**Statements**", "");
      for (const st of placed) out.push(said(st));
      out.push("");
    }
    const { passages, answers } = evidenceBehind(view, c.id);
    const turns = answers.filter((x) => x.startsWith("turn:")).length;
    const behind = [
      ...answers.filter((x) => !x.startsWith("turn:")).map((a) => `your answer at ${stepName(a)}`),
      ...(turns === 0 ? [] : [turns === 1 ? "one reply of yours in a conversation" : `${turns} replies of yours in a conversation`]),
      ...passages.map((p) => passageRef(p)),
    ];
    out.push(behind.length === 0 ? "**Evidence:** a passage or an answer is still to come." : `**Evidence:** ${behind.join("; ")}.`, "");
  }
  /* M74a, ISC-663: "17 suggested concepts wait for your decision." gave a
     suggestion an act (L17). The researcher is the agent. */
  if (view.suggested.length > 0) out.push(`_You have ${toDecide(view.suggested.length, "concept")} to decide on._`, "");

  /* M67, ISC-635: each relation as a card of its own, in the order set. */
  out.push("### Relations", "");
  if (view.acceptedRelations.length === 0) out.push("You haven't accepted a relation yet.", "");
  view.acceptedRelations.forEach((r, i) => {
    out.push(`#### R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}`, "");
    if (r.origin !== undefined) out.push(`_${conceptWrittenLine(r.origin, r.original !== null)}._`, "");
    const relationFromChat = chatLine({ ...(r.madeFrom === undefined ? {} : { source: r.madeFrom }), ...(r.drawnFrom === undefined ? {} : { drawnFrom: r.drawnFrom }) });
    if (relationFromChat !== null) out.push(relationFromChat, "");
    out.push(r.claim === "" ? "Claim not written yet." : r.claim, "");
    if (r.why !== null && kept(r.why)) out.push(whyReportLine(r.why), "");
    out.push(`**Conditions:** ${r.conditions === "" ? "none written yet." : r.conditions}`, "");
    const placed = r.statementIds.map((id) => view.statements.get(id)).filter((x): x is Statement => x !== undefined);
    if (placed.length > 0) {
      out.push("**Statements**", "");
      for (const st of placed) out.push(said(st));
      out.push("");
    }
    const { passages, answers } = evidenceBehindRelation(view, r.id);
    const behind = [...answers.filter((x) => !x.startsWith("turn:")).map((a) => `your answer at ${stepName(a)}`), ...passages.map((p) => passageRef(p))];
    out.push(behind.length === 0 ? "**Evidence:** a passage or an answer is still to come." : `**Evidence:** ${behind.join("; ")}.`, "");
  });
  if (view.suggestedRelations.length > 0) out.push(`_You have ${toDecide(view.suggestedRelations.length, "relation")} to decide on._`, "");
  if (view.toPlace.length > 0) out.push(`_You have ${view.toPlace.length === 1 ? "one statement" : `${view.toPlace.length} statements`} still to place under a concept or a relation._`, "");

  out.push("## What to look for in the field", "");
  const open = view.lookFor.filter((l) => l.settled === null && view.concepts.get(l.conceptId)?.status === "accepted");
  if (open.length === 0) out.push("Every line has its answer.", "");
  /* M78a, ISC-679 (the lead's ruling): grouped under each concept's heading,
     each line once, with the question only; the heading names the concept. */
  for (const c of view.accepted) {
    const lines = [...new Set(open.filter((l) => l.conceptId === c.id).map((l) => questionOnly(l.text, c.name)))];
    if (lines.length === 0) continue;
    out.push(`### ${c.name}`, "");
    for (const line of lines) out.push(`- ${line}`);
    out.push("");
  }
  const settled = view.lookFor.length - view.lookFor.filter((l) => l.settled === null).length;
  if (settled > 0) out.push(`_${settled} lines settled._`, "");

  /* M89 (2026-10-14): "## Readiness report", with its rows, Fix first, the
     reviewer's questions, the rivals, the read-back, Biases flagged and the
     bias readings, stood here until the checks left main. */
  return out;
}

/** A field line without the concept's name, which its heading carries: "In each case of X, how …?" reads "How …?". */
function questionOnly(text: string, concept: string): string {
  for (const lead of [`In each case of ${concept}, `, `Across your cases of ${concept}, `]) {
    if (text.startsWith(lead)) {
      const rest = text.slice(lead.length);
      return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
    }
  }
  return text;
}

/**
 * The anchor of a relation's heading in the Report, as Markdown renderers slug
 * "#### R1. Online booking system leads to Dave's introductions" (M78a).
 */
export function relationAnchor(
  index: number,
  r: { readonly from: string; readonly to: string; readonly relation: Parameters<typeof relationSentence>[1] },
  name: (id: string) => string,
): string {
  return `R${index + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The concept map as a standalone SVG, from the tab's own layout. Null with no accepted concept. */
export function conceptMapSvg(
  events: readonly LedgerEvent[],
  projectId: string,
  graph: OntologyGraph,
  options: { readonly title: string; readonly stamp: string },
): string | null {
  const view = projectConcepts(events, projectId, graph);
  if (view.accepted.length === 0) return null;
  const W = 720;
  const MAP_H = 520;
  const TOP = 48;
  /* M67, ISC-635: the figure carries the relation cards as a numbered key
     under the map, each edge labelled with its number. */
  const name = (id: string) => view.concepts.get(id)?.name ?? "a concept";
  const number = new Map(view.acceptedRelations.map((r, i) => [r.id, i + 1] as const));
  const key = view.acceptedRelations.map(
    (r, i) => `R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}${r.claim === "" ? "" : `: ${r.claim}`}${r.conditions === "" ? "" : ` Conditions: ${r.conditions}`}`,
  );
  const relationText = (l: (typeof view.links)[number]) =>
    number.has(l.id) ? `R${number.get(l.id)} ${RELATION_PHRASE[l.relation]}` : RELATION_PHRASE[l.relation];
  /* M77b, M82 (ISC-693): the figure is laid out by the tab's own rule at its own
     sizes, so its concept labels repel each other, its lines run clear of every
     label and dot, and its relation labels sit clear of all of them. The drawing
     grows taller when it needs to, and the key moves down with it. */
  const drawing = conceptMapDrawing({
    projectId,
    concepts: view.accepted,
    links: view.links,
    relations: view.links.map((l) => ({ id: l.id, from: l.from, to: l.to, text: relationText(l) })),
    width: W,
    minHeight: MAP_H - TOP,
    labels: { lines: (c) => labelLines(c.name, 20), type: FIGURE_TYPE },
  });
  const MAP_BOTTOM = drawing.height + TOP;
  const H = MAP_BOTTOM + (key.length === 0 ? 0 : 24 + key.length * 18);
  const R = 9;
  const at = drawing.at;
  const shift = (p: { readonly x: number; readonly y: number }) => `${p.x.toFixed(1)},${(p.y + TOP).toFixed(1)}`;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">`,
    `<desc>Concept map exported from Abductive at design stamp ${escapeXml(options.stamp)}.</desc>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${COLOUR["ink-faint"]}"/></marker></defs>`,
    `<rect width="${W}" height="${H}" fill="${COLOUR.paper}"/>`,
    `<text x="16" y="28" font-size="16" font-weight="600" fill="${COLOUR.ink}">${escapeXml(`${options.title}: concept map`)}</text>`,
  ];
  for (const l of view.links) {
    const route = drawing.routes.get(l.id);
    const label = drawing.placed.get(l.id);
    if (route === undefined || label === undefined) continue;
    const ids = `data-relation="${escapeXml(l.id)}" data-from="${escapeXml(l.from)}" data-to="${escapeXml(l.to)}"`;
    parts.push(
      `<polyline points="${route.map(shift).join(" ")}" fill="none" stroke="${COLOUR["ink-faint"]}" stroke-width="1.5" marker-end="url(#arrow)" ${ids}/>`,
      ...(label.leader === null
        ? []
        : [
            `<line x1="${label.leader.x1.toFixed(1)}" y1="${(label.leader.y1 + TOP).toFixed(1)}" x2="${label.leader.x2.toFixed(1)}" y2="${(label.leader.y2 + TOP).toFixed(1)}" stroke="${COLOUR["ink-faint"]}" stroke-width="0.75" data-leader="${escapeXml(l.id)}"/>`,
          ]),
      `<text x="${label.x.toFixed(1)}" y="${(label.y + TOP).toFixed(1)}" text-anchor="middle" font-size="12" fill="${COLOUR["ink-muted"]}" data-relation="${escapeXml(l.id)}">${escapeXml(relationText(l))}</text>`,
    );
  }
  for (const c of view.accepted) {
    const p = at.get(c.id);
    if (p === undefined) continue;
    const lines = labelLines(c.name, 20);
    const place = labelPlace(FIGURE_TYPE, lines.length, drawing.sides.get(c.id) ?? "below");
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${(p.y + TOP).toFixed(1)}" r="${R}" fill="${COLOUR.paper}" stroke="${COLOUR.accent}" stroke-width="2" data-concept="${escapeXml(c.id)}"/>`);
    lines.forEach((line, i) => {
      parts.push(
        `<text x="${(p.x + place.dx).toFixed(1)}" y="${(p.y + TOP + place.first + i * FIGURE_TYPE.conceptLine).toFixed(1)}" text-anchor="${place.anchor}" font-size="13" fill="${COLOUR.ink}" data-concept="${escapeXml(c.id)}">${escapeXml(line)}</text>`,
      );
    });
  }
  key.forEach((line, i) => {
    parts.push(
      `<text x="16" y="${MAP_BOTTOM + 20 + i * 18}" font-size="12" fill="${COLOUR.ink}">${escapeXml(line.length > 118 ? `${line.slice(0, 117)}…` : line)}</text>`,
    );
  });
  parts.push("</svg>");
  return parts.join("\n");
}
