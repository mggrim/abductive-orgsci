/**
 * The sheet on `?`, generated from the table it documents (FND-02).
 *
 * Linear's map on `?` is the reason a Linear-literate critic finds this app's
 * keyboard model missing in ten seconds. The part worth copying is not the
 * sheet, it is that the sheet is not maintained: it is a render of the same
 * table the listener reads, so a binding added without a line of documentation
 * documents itself, and a binding removed cannot leave its entry behind. There
 * is no string in this file that names a key.
 *
 * It is a native <dialog> because the platform already solves what a hand
 * rolled modal gets wrong: focus is trapped while it is open and restored to
 * the element that opened it, Escape closes it, the rest of the page is inert,
 * and the backdrop is a pseudo-element rather than a div that has to be kept
 * in front of everything.
 */

import { SECTIONS, bindingsInSection, type Binding, type Scope } from "./bindings.ts";
import { Sheet } from "../components/Sheet.tsx";
import { Caps } from "./Caps.tsx";

function Row(props: { binding: Binding }) {
  const { binding } = props;
  return (
    <div className="kbd-row">
      <Caps keys={binding.keys} />
      <span className="kbd-what">
        <span className="kbd-label">{binding.label}</span>
        {binding.note !== undefined && <span className="kbd-note small muted">{binding.note}</span>}
      </span>
    </div>
  );
}

export function ShortcutSheet(props: { open: boolean; scope: Scope; onClose: () => void }) {
  const { open, scope, onClose } = props;

  /* The frame is `components/Sheet.tsx` since M39 (ISC-503). The four lines this
   * file used to write — showModal, close, the native close event, the heading
   * and its close button — were the same four `RecordPanel` wrote, and the
   * companion below 1100px needed a third copy. The argument for a native
   * <dialog> is unchanged and now lives with the frame: focus is trapped and
   * handed back, Escape closes it, the rest of the page is inert, and the
   * backdrop is the platform's.
   *
   * What stays here is the only part that was ever this file's: a render of the
   * same table the listener reads, so a binding cannot be documented wrongly. */
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keyboard"
      className="kbd-sheet"
      testId="shortcut-sheet"
    >
      <>
        <p className="kbd-rule">
          The keys that point at the controls to accept a claim, dismiss a flag, ask a model or write
          a file move focus to them. You press the control yourself.
        </p>

        <div className="kbd-sections">
          {SECTIONS.map((section) => {
            const rows = bindingsInSection(section.id, scope);
            if (rows.length === 0) return null;
            return (
              <section className="kbd-section" key={section.id}>
                <h3>{section.title}</h3>
                {section.note !== undefined && <p className="small muted">{section.note}</p>}
                <div className="kbd-rows">
                  {rows.map((binding) => (
                    <Row binding={binding} key={binding.id} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {scope === "global" && (
          <p className="kbd-foot small muted">
            You see the view and step keys once you're inside a project.
          </p>
        )}
      </>
    </Sheet>
  );
}
