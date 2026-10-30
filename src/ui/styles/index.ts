/**
 * The single cascade-order declaration (FND-10, FND-11).
 *
 * One 989-line stylesheet became eleven files so that six surface builders can
 * hold six of them without touching each other's selectors. Sixteen now: the
 * primitives, the keyboard model, and at M32 the panel grammar, the rail and
 * the row, which are structure more than one route reads rather than surfaces
 * of their own. That only works if the order they load in is stated once, in one place,
 * and read rather than inferred. This is that place. AppShell imports this
 * module and nothing else imports a stylesheet.
 *
 * The order is not arbitrary and changing it changes the app:
 *
 *   tokens   declares every custom property; nothing may load before it
 *   base     roles only, no surface names, so any surface rule can override it
 *   comps    the six shared primitives, after base because they extend those
 *            roles and before every surface because a surface still overrides
 *            them; no selector is declared in both base.css and components.css,
 *            so the position is documentation rather than a load-bearing order
 *   rows     the row primitive, the other half of comps: the hairline, the two
 *            surfaces and the reveal that four surfaces draw a list with. Here
 *            rather than in the run below because it is a primitive, and the
 *            surfaces that consume it keep their own padding by overriding it
 *   shell    the frame and the two tiers, present on every route
 *   ...      the nine surfaces, alphabetical from here, because none of them
 *            depends on another's cascade position; if one ever does, that is a
 *            selector collision to fix rather than an order to tune
 *
 * Ordering constraints that matter live inside the files, at the rules
 * themselves: `.turn-refusal` after `.turn` in design.css, and
 * `.cg-mark[data-on="false"]` after `.cg-mark[data-selected="true"]` in
 * biases.css. Both are equal-specificity pairs where the later rule is the one
 * that renders.
 *
 * tests/styles-integrity.test.ts asserts that this file imports every .css in
 * the directory, so a new surface file cannot be added and silently orphaned.
 */

import "./tokens.css";
import "./base.css";
import "./components.css";
// M63, ISC-609: the Emerging project ontology tab.
import "./concepts.css";
// M32 R8. The second half of the primitive layer rather than a surface, so it
// sits with components.css and not in the alphabetical run below: four
// surfaces draw a row and the row's states are declared once, here, before any
// of them. Same position for the same reason components.css has it — after the
// roles base.css sets, before every surface that overrides them.
import "./rows.css";
import "./shell.css";
import "./biases.css";
// M89: "./coherence.css", the Checks tab's sheet, went with the tab.
import "./design.css";
import "./exports.css";
import "./instrumentation.css";
import "./intro.css";
// Not a route. The keyboard model's sheet, palette and chord chip render over
// whichever surface is up, and the file is here for the same reason as the
// rest: one declaration of what loads and in what order (FND-02).
import "./search.css";
import "./material.css";
import "./ontology.css";
// M32. Two surfaces, both alphabetical among the rest, and both new rather
// than moved: panels.css holds the three-part panel grammar every study route
// now lays itself out with (R5), and rail.css holds the navigation rail that
// replaced the masthead (R2). Neither depends on another surface's cascade
// position; the rail's collapsed state is selected from `.shell[data-rail]`,
// which shell.css declares above.
import "./panels.css";
import "./rail.css";
