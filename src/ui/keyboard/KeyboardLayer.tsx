/**
 * The one mount point (FND-02).
 *
 * AppShell renders this and nothing else changes: the listener, the roving
 * groups, the aria-keyshortcuts stamp, the sheet and the palette all install
 * from here. That was the constraint the wave was built under, six surface
 * builders working in parallel, and it is also the right shape. A keyboard
 * model assembled out of per-surface handlers cannot answer what is bound,
 * cannot print a sheet, and cannot be checked against the governing rule.
 *
 * Every intent this file can run is a route change, a focus move or an
 * overlay. There is no branch that appends to the ledger, asks a model for
 * anything or writes a file, and the switch is exhaustive over `Intent`, so a
 * later builder adding a member has to come here and find out.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate, parseHash, studyPath, STUDY_TABS, type Route } from "../routes.ts";
import { LISTENED, type Binding, type Intent, type Overlay, type Scope } from "./bindings.ts";
import { useHotkeys } from "./useHotkeys.ts";
import { installRoving, moveRoving, syncRoving } from "./roving.ts";
import { resolveTarget, stampShortcuts } from "./targets.ts";
import { ShortcutSheet } from "./ShortcutSheet.tsx";
import { CommandPalette } from "./CommandPalette.tsx";

/**
 * The layer reads the hash itself rather than taking the route as a prop. One
 * line in AppShell was the whole budget for this wave, and the hash is already
 * the app's single source of truth for where the researcher is.
 */
function useRouteHash(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function KeyboardLayer() {
  const route = useRouteHash();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const scope: Scope = route.view === "study" ? "study" : "global";

  // While an overlay is up, the only binding live is the one that closes it.
  // The rest are the platform's job: a modal <dialog> makes the page behind it
  // inert, and a g-prefix firing underneath an open sheet would move the route
  // out from under the researcher reading it.
  const active = useMemo(() => {
    const inScope = LISTENED.filter((b) => b.scope === "global" || b.scope === scope);
    return overlay === null
      ? inScope.filter((b) => b.intent.kind !== "close-overlay")
      : inScope.filter((b) => b.intent.kind === "close-overlay");
  }, [scope, overlay]);

  const run = useCallback(
    (intent: Intent) => {
      switch (intent.kind) {
        case "browser-opens-a-fold":
          // Nothing to run, and the case is here to say so rather than to be
          // filled in later. Enter and Space on a focused <summary> belong to
          // the platform; LISTENED drops this row so no listener is installed
          // for it, and the sheet prints it so the keyboard model is not silent
          // about the one control /material is built out of.
          return;
        case "go-tab": {
          if (route.view !== "study") return;
          navigate(studyPath(route.projectId, intent.tab, route.station));
          return;
        }
        case "cycle-tab": {
          if (route.view !== "study") return;
          const at = STUDY_TABS.indexOf(route.tab);
          const next = STUDY_TABS[(at + intent.delta + STUDY_TABS.length) % STUDY_TABS.length];
          if (next !== undefined) navigate(studyPath(route.projectId, next, route.station));
          return;
        }
        case "go-station": {
          if (route.view !== "study") return;
          navigate(studyPath(route.projectId, "design", intent.station));
          return;
        }
        case "go-route":
          navigate(intent.hash);
          return;
        case "focus": {
          // Focus, and stop. The researcher presses.
          resolveTarget(intent.target, document)?.focus();
          return;
        }
        case "rove":
          moveRoving(document, intent.delta);
          return;
        case "open":
          setOverlay(intent.overlay);
          return;
        case "close-overlay":
          setOverlay(null);
          return;
      }
    },
    [route],
  );

  const pending = useHotkeys(active, run);

  useEffect(() => installRoving(document), []);

  // The stamp runs on every route change and on every render of the surfaces
  // underneath, because the controls it names are mounted and unmounted by
  // six other files. A control that appears after the stamp would otherwise
  // advertise nothing while answering to a key.
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      stampShortcuts(document, LISTENED);
      syncRoving(document);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(apply);
    };
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [route]);

  const go = useCallback(
    (binding: Binding) => {
      // The palette hands back a binding rather than an intent, and only ever a
      // navigate one; running it through the same switch keeps one code path.
      run(binding.intent);
    },
    [run],
  );

  const close = useCallback(() => setOverlay(null), []);

  return (
    <>
      {pending !== null && (
        <p className="kbd-chord" role="status" data-testid="chord-pending">
          <kbd>{pending}</kbd>
          <span>waiting for the second key</span>
        </p>
      )}
      <ShortcutSheet open={overlay === "sheet"} scope={scope} onClose={close} />
      <CommandPalette
        open={overlay === "palette"}
        scope={scope}
        {...(route.view === "study" ? { projectId: route.projectId } : {})}
        onClose={close}
        onGo={go}
      />
    </>
  );
}
