/**
 * A chord, drawn (FND-02).
 *
 * Shared by the sheet and the palette so the two print a binding the same way.
 * It takes the chord in the table's notation and renders it, which means no
 * component anywhere carries a key name of its own: the only place a keystroke
 * is written down is bindings.ts.
 */

import { keyCaps, modLabel } from "./chords.ts";

function platform(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform;
}

export function Caps(props: { keys: string }) {
  const mod = modLabel(platform());
  const steps = props.keys.includes(" ") ? props.keys.split(" ") : [props.keys];
  const isSequence = steps.length > 1;
  return (
    <span className="kbd-caps">
      {steps.map((step, i) => (
        <span className="kbd-step" key={`${i}:${step}`}>
          {i > 0 && <span className="kbd-then">then</span>}
          {(isSequence ? [step] : keyCaps(step)).map((cap, j) => (
            <kbd key={`${j}:${cap}`}>{cap === "Mod" ? mod : cap}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
