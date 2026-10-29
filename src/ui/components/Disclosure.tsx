/**
 * A folded section.
 *
 * There were seven <details> elements in the app and each one styled its own
 * summary: four at 0.8rem, two at 0.85rem, one at 0.78rem, three in accent and
 * one inheriting. Three of them also put the number of folded items in a
 * different shape, so "Sources (3)", "3 sources" and a bare badge were the same
 * pattern three ways.
 *
 * It is a native element and it should stay one. Keyboard behaviour, the
 * disclosure triangle and the open state all come from the browser, which is
 * why this is a thin wrapper rather than a button with aria-expanded and a
 * div: the native one is correct in every browser and needs no state.
 */

import type { ReactNode } from "react";
import { StatusChip } from "./StatusChip.tsx";

/**
 * The count, as the chip the summary renders, or nothing.
 *
 * A count of zero renders. A summary that hides its count when it is zero is
 * one where the researcher cannot tell an empty fold from a fold nothing has
 * looked in yet, which is the same distinction the empty state exists to make.
 */
export function disclosureChip(
  count?: number,
  noun = "items",
): { readonly label: string; readonly count: number } | undefined {
  return count === undefined ? undefined : { label: noun, count };
}

export function Disclosure(props: {
  summary: string;
  /** How many folded things are in here. Zero renders. */
  count?: number;
  /** What they are called, for the chip. */
  countNoun?: string;
  /**
   * A count that one chip cannot carry, as words beside the summary: the
   * concept map's "6 concepts, 1 relation" (M79). Muted, so the summary stays
   * the fold's name.
   */
  note?: string;
  defaultOpen?: boolean;
  /**
   * Held by the caller when given (M79): the concept map's fold opens on the
   * first accepted concept and remembers the researcher's choice, so its state
   * is the caller's. The element stays native and toggles itself; `onOpenChange`
   * hears a toggle only when the element differs from what the caller holds,
   * so a default that changes under it is never read back as a choice.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  const { summary, count, countNoun, note, defaultOpen, open, onOpenChange, children, testId } = props;
  const chip = disclosureChip(count, countNoun);
  const held = open !== undefined;
  const onToggle = (e: { readonly currentTarget: HTMLDetailsElement }) => {
    const now = e.currentTarget.open;
    if (now !== open) onOpenChange?.(now);
  };
  return (
    <details
      className="disclosure"
      open={held ? open : defaultOpen === true}
      data-testid={testId}
      {...(held ? { onToggle } : {})}
    >
      <summary>
        {summary}
        {chip !== undefined && <StatusChip label={chip.label} count={chip.count} />}
        {note !== undefined && (
          <span className="disclosure-note" {...(testId === undefined ? {} : { "data-testid": `${testId}-note` })}>
            {note}
          </span>
        )}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
