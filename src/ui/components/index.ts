/**
 * The shared primitives (FND-03, FND-06, FND-09, FIN-01).
 *
 * Seven components that five surfaces consume, shipped ahead of the surface
 * waves so that six builders do not each invent an empty state, a decision
 * triad and a finding row. Every one of them exists because the survey found
 * the same thing done between three and five different ways on three to five
 * screens. The seventh, inert.tsx, was added a round later for the opposite
 * reason: disabled was done exactly one way everywhere, and the one way was
 * `opacity: 0.5` with no explanation attached.
 *
 * They are presentational. None of them appends to the ledger, spends a model
 * call or navigates: the surface owns those, because the event shape differs
 * per object family and because a primitive that wrote events would put an
 * accept behind a keystroke, which the keyboard model forbids.
 *
 * Their CSS is src/ui/styles/components.css, which loads immediately after
 * base.css so a surface file still overrides either of them.
 */

export {
  EMPTY_STATE_MARK_SIZE,
  EmptyState,
  emptyStateModel,
  type EmptyStateModel,
} from "./EmptyState.tsx";
/**
 * The row (M32 R8). The eighth primitive, and the one that arrived for the
 * reason the first six did: four surfaces were drawing a list four ways, three
 * of them as stacks of bordered cards. Its stylesheet is src/ui/styles/rows.css
 * rather than components.css, because the row is the one primitive whose rules
 * three surfaces deliberately override.
 */
export { Row, RowActions, ROW_MARK_SIZE, ROW_MIN_HEIGHT, rowClass, type RowTag } from "./Row.tsx";
export { DecisionGroup, decisionTabOrder } from "./DecisionGroup.tsx";
/* M89: FindingRow, the row a check's flag drew on Checks, went with the checks. */
export { Disclosure, disclosureChip } from "./Disclosure.tsx";
export { Field, fieldAria, fieldErrorId, fieldHintId, type FieldAria } from "./Field.tsx";
export { StatusChip, chipModel, type ChipModel, type ChipTone } from "./StatusChip.tsx";
export { InertNote, inertAttrs, inertNoteId, type InertAttrs } from "./inert.tsx";
/**
 * The page-identity boundary (round nine). Everything the app is allowed to
 * know about how a page is drawn, and nothing else: no hue, no fill share, no
 * attribute record, only rendered output. See PageMark.tsx for why the previous
 * eight fixes did not hold and why this one is a boundary rather than a rule.
 */
export {
  OriginDisc,
  OriginMark,
  PageDisc,
  PageMark,
  PageTypeKeySwatch,
  SizeContrastKeySwatch,
  adriftLegendSvg,
  originDoubtLegendSvg,
  originLegendSvg,
  pageDiscSvg,
  pageTypeKeySwatchSvg,
  sizeContrastLegendSvg,
  sizeContrastSpan,
  type PageIdentity,
} from "./PageMark.tsx";
/**
 * The direction half of a relation, for the same reason: the screen drew an
 * arrowhead and the exported figure drew none, so the one artefact that leaves
 * the tool lost the direction the ledger records. One glyph, two forms.
 */
export {
  ARROW_HEAD,
  ArrowMarker,
  arrowMarkerId,
  arrowMarkerRef,
  arrowMarkerSvg,
} from "./RelationMark.tsx";
export {
  DECISION_ORDER,
  DECISION_VERBS,
  REASON_CLOSED,
  canRecordDecline,
  decisionButtonClass,
  decisionRoles,
  editReason,
  openReason,
  reasonFieldIsLive,
  reasonGiven,
  type DecisionRole,
  type DecisionVerb,
  type ReasonDraft,
} from "./decisions.ts";
