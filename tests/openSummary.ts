/**
 * M92, ISC-752: a summary reads as text until Edit summary opens its box. The
 * DOM tests that type into a summary press the control first, through React's
 * own handler, as the other DOM tests press buttons.
 */
import { act } from "react";

export async function openSummary(host: Element, prefix: string): Promise<void> {
  const button = host.querySelector(`[data-testid="${prefix}-edit"]`) as HTMLElement | null;
  if (button === null) return;
  const key = Object.keys(button).find((k) => k.startsWith("__reactProps$"));
  if (key === undefined) return;
  await act(async () => {
    (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick();
  });
}
