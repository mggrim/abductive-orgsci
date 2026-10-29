/**
 * Says, on every screen, when no model is attached (ISC-290 … ISC-293).
 *
 * With no provider selected the app falls back to `MockInferenceClient`, which
 * returns fluent, confident, canned research prose. Nothing on screen said so.
 * During M17 development that fooled the author of the tool through two full
 * turns; what gave it away was the two turns being word-for-word identical,
 * not anything the interface did.
 *
 * That is the tool's own subject matter turned against it. Abductive exists to
 * stop a researcher mistaking a model's fluency for their own finding, and it
 * was quietly serving fixtures as interview turns. The ledger was always
 * honest — every mock event carries `model: "mock"` — so this is a display
 * failure, and the display is where a researcher looks.
 *
 * Deliberately not dismissible. A banner you can close is a banner that is
 * closed during the session where it mattered.
 */

import { useEffect, useState } from "react";
import { activeInferenceClient } from "./personaRun.ts";
import {
  detectBridge,
  PROVIDER_CHANGED_EVENT,
  resetBridgeDetection,
} from "../inference/cliBridge.ts";
import { navigate } from "./routes.ts";

export function OfflineBanner() {
  const [live, setLive] = useState(true);

  useEffect(() => {
    const read = () => {
      try {
        setLive(activeInferenceClient().live);
      } catch {
        setLive(false);
      }
    };
    // Probe once, then read. A bridge the researcher already started should
    // not have to be re-declared in every tab.
    void detectBridge().then(read);
    read();

    // While offline, keep looking: someone who starts the bridge after opening
    // the app should not have to reload to be believed. While online, stop —
    // a healthy connection does not need re-checking on every focus event.
    const recheck = () => {
      if (live) {
        read();
        return;
      }
      resetBridgeDetection();
      void detectBridge().then(read);
    };

    // Selection happens on another route and, since M17, in another tab.
    window.addEventListener("hashchange", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("focus", recheck);
    // M54: the panel connecting in this tab takes the bar away without a reload.
    window.addEventListener(PROVIDER_CHANGED_EVENT, read);
    return () => {
      window.removeEventListener(PROVIDER_CHANGED_EVENT, read);
      window.removeEventListener("hashchange", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [live]);

  if (live) return null;

  return (
    <div className="offline-banner" role="alert" data-testid="offline-banner">
      <strong>Abductive is running without a model.</strong> Every answer below is a fixture, the same canned
      text whatever you ask. Text produced now isn't evidence about your project, though History
      marks each of these turns as a mock either way.{" "}
      {/* An anchor, for the same reason as the one on /design/tension: this is
          a link inside a sentence and it goes somewhere. As a button it was an
          atomic inline-level box that could not fragment across a line break,
          in a banner whose whole content is one paragraph of running prose. */}
      <a
        className="linkish"
        href="#/settings"
        onClick={(e) => {
          e.preventDefault();
          navigate("#/settings");
        }}
      >
        Connect a model
      </a>
    </div>
  );
}
