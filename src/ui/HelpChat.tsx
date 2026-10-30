/**
 * The help chat inside the Help panel (M95, ISC-771 .. ISC-781).
 *
 * The owner, 2026-10-30: "a help chat functionality for users as they want to
 * learn about how to use the site and what to do if they're feeling stuck",
 * one that knows the app, the researcher and their project. His four answers
 * the same day: build it now; read the project plus an optional About you
 * profile; coach, don't write; and put help on the record as its own events.
 *
 * On a study page each request is a `help-asked` event, written before the
 * model is called, and each answer a `help-answered` event from the model, so
 * study mode can count where people got stuck and read what help told them.
 * Outside a project (Projects, Model access) the chat works from the guide and
 * the profile alone and writes to no project; the exchanges last for the page's
 * life. The mock client answers here never: without a live model the chat
 * says so and the controls are off.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { HelpAnsweredEvent, HelpAskedEvent, LedgerEvent } from "../ledger/events.ts";
import { useOptionalLedger } from "../state/ledgerContext.tsx";
import type { Project } from "../state/projects.ts";
import { listChunks } from "../state/projects.ts";
import { dataOnly } from "../state/chunks.ts";
import { streamOrComplete, providerField, type InferenceClient } from "../inference/types.ts";
import { reviseInVoice } from "../inference/voiceRetry.ts";
import { voiceGateProvenance } from "../inference/voiceGate.ts";
import { guidanceAnswerViolations } from "../interview/prompt.ts";
import { activeInferenceClient } from "./personaRun.ts";
import { navigate } from "./routes.ts";
import { sendsOnKey } from "../workbench/Dialogue.tsx";
import type { HelpPage } from "./pageHelp.ts";
import {
  ABOUT_YOU_FIELDS,
  aboutSnapshot,
  aboutYouFilled,
  CAREER_STAGES,
  QUAL_EXPERIENCE,
  readAboutYou,
  writeAboutYou,
  type AboutYou,
  type CareerStage,
  type QualExperience,
} from "../help/aboutYou.ts";
import { HELP_ACTOR, HELP_REWRITE_ASKS, helpExchanges, helpMessages, helpSystemPrompt } from "../help/helpPrompt.ts";

/** The words the I'm stuck button puts in the chat and on the record. */
export const STUCK_WORDS = "I'm stuck.";

export const HELP_CHAT_HEADING = "Help chat";
export const HELP_OFFLINE_LINE = "Abductive answers help requests once you connect a model.";
export const HELP_OUTSIDE_PROJECT_LINE =
  "Outside a project, Abductive keeps this chat until you reload the page. Inside a project, Abductive saves your help requests to History.";
export const HELP_FAILED_LINE = "Abductive couldn't reach the model. Try again.";
export const ABOUT_YOU_LINE =
  "Abductive reads your answers here before answering a help request and fits the answer to you. Abductive keeps these answers in this browser only.";

/** One exchange as the thread shows it, from the record or from the page's life. */
interface ShownExchange {
  readonly id: string;
  readonly text: string;
  readonly stuck?: boolean;
  readonly answer?: string;
  readonly cutShort?: boolean;
}

const NO_EVENTS: readonly LedgerEvent[] = [];

/** Outside a project: the exchanges per page, for the page's life. */
const pageExchanges = new Map<HelpPage, ShownExchange[]>();

interface Request {
  readonly text: string;
  readonly stuck?: boolean;
  /** On a retry, the request already on the record. */
  readonly askedId?: string;
}

type ClientChoice = () => { readonly client: InferenceClient; readonly live: boolean };

function readConnected(choose: ClientChoice): boolean {
  try {
    return choose().live;
  } catch {
    return false;
  }
}

export function HelpChat(props: {
  readonly page: HelpPage;
  readonly station?: string;
  /** The project the page belongs to; absent on Projects and Model access. */
  readonly project?: Project;
  /** The client, `activeInferenceClient` unless a test hands one in. */
  readonly inference?: ClientChoice;
  /** M95c: the page's own help, folded, which sits under the chat and above About you. */
  readonly aboutPage?: ReactNode;
}) {
  const { page, station } = props;
  const choose = props.inference ?? activeInferenceClient;
  const ledger = useOptionalLedger();
  /* A project is read and recorded only where the tree has a ledger to record into. */
  const project = ledger === null ? undefined : props.project;
  const events = ledger?.events ?? NO_EVENTS;
  const headingId = useId();
  const [connected, setConnected] = useState(() => readConnected(choose));
  useEffect(() => {
    const read = () => setConnected(readConnected(choose));
    window.addEventListener("hashchange", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("storage", read);
    };
  }, [choose]);

  const [about, setAbout] = useState<AboutYou>(() => readAboutYou());
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [failed, setFailed] = useState<Request | null>(null);
  const [local, setLocal] = useState<readonly ShownExchange[]>(() => pageExchanges.get(page) ?? []);
  const stopper = useRef<AbortController | null>(null);

  /* Early data counts as answered once the project has data, as on the rail. */
  const [dataIds, setDataIds] = useState<readonly string[]>([]);
  const projectId = project?.id;
  useEffect(() => {
    if (projectId === undefined) return;
    let cancelled = false;
    void listChunks(projectId)
      .then((chunks) => {
        if (!cancelled) setDataIds(dataOnly(chunks).map((c) => c.id));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const shown: readonly ShownExchange[] = useMemo(() => {
    if (projectId === undefined) return local;
    return helpExchanges(events, projectId).map((x) => ({
      id: x.asked.id,
      text: x.asked.text,
      ...(x.asked.stuck === true ? { stuck: true } : {}),
      ...(x.answer === undefined ? {} : { answer: x.answer.text }),
      ...(x.answer?.cutShort === true ? { cutShort: true } : {}),
    }));
  }, [events, projectId, local]);

  const keepLocal = useCallback(
    (next: readonly ShownExchange[]) => {
      pageExchanges.set(page, [...next]);
      setLocal(next);
    },
    [page],
  );

  const send = useCallback(
    async (request: Request) => {
      if (stopper.current !== null) return;
      const { client, live } = choose();
      if (!live) {
        setConnected(false);
        return;
      }
      setFailed(null);
      const snapshot = aboutSnapshot(about);
      const id = request.askedId ?? crypto.randomUUID();
      let earlier: readonly ShownExchange[];
      let system: string;
      let localThread: readonly ShownExchange[] = local;
      if (project !== undefined && ledger !== null) {
        if (request.askedId === undefined) {
          const asked: HelpAskedEvent = {
            id,
            ts: Date.now(),
            actor: "human",
            projectId: project.id,
            type: "help-asked",
            page,
            ...(page === "design" && station !== undefined ? { station } : {}),
            text: request.text,
            ...(request.stuck === true ? { stuck: true as const } : {}),
            ...(snapshot === undefined ? {} : { about: snapshot }),
          };
          await ledger.append(asked);
        }
        const fresh = await ledger.readEvents(project.id);
        earlier = helpExchanges(fresh, project.id)
          .filter((x) => x.asked.id !== id)
          .map((x) => ({
            id: x.asked.id,
            text: x.asked.text,
            ...(x.asked.stuck === true ? { stuck: true } : {}),
            ...(x.answer === undefined ? {} : { answer: x.answer.text }),
          }));
        system = helpSystemPrompt({
          page,
          ...(station === undefined ? {} : { station }),
          ...(snapshot === undefined ? {} : { about: snapshot }),
          project: { project, events: fresh, dataChunkIds: dataIds },
        });
      } else {
        earlier = local.filter((x) => x.id !== id);
        if (request.askedId === undefined) {
          localThread = [...local, { id, text: request.text, ...(request.stuck === true ? { stuck: true } : {}) }];
          keepLocal(localThread);
        }
        system = helpSystemPrompt({
          page,
          ...(station === undefined ? {} : { station }),
          ...(snapshot === undefined ? {} : { about: snapshot }),
        });
      }

      const controller = new AbortController();
      stopper.current = controller;
      setStreaming("");
      let accumulated = "";
      const finish = async (text: string, extra: Partial<HelpAnsweredEvent>, model: { model: string; modelVersion: string }) => {
        if (project !== undefined && ledger !== null) {
          const answer: HelpAnsweredEvent = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            actor: HELP_ACTOR,
            projectId: project.id,
            type: "help-answered",
            asked: id,
            text,
            model: model.model,
            modelVersion: model.modelVersion,
            ...extra,
          };
          await ledger.append(answer);
        } else {
          keepLocal(
            localThread.map((x) => (x.id === id ? { ...x, answer: text, ...(extra.cutShort === true ? { cutShort: true } : {}) } : x)),
          );
        }
      };
      try {
        let result = await streamOrComplete(
          client,
          { signal: controller.signal, system, messages: helpMessages(earlier, request) },
          (delta) => {
            accumulated += delta.text;
            setStreaming(accumulated);
          },
        );
        /* M95b: one rewrite ask, not two. The walk measured the retry firing on
           every help answer (L13, L17, L18), and the two asks were two thirds of
           the turn; the step chat keeps its two. */
        result = await reviseInVoice(client, result, controller.signal, { quotable: [request.text] }, HELP_REWRITE_ASKS);
        const leaks = guidanceAnswerViolations(result.text).map((l) => l.phrase);
        await finish(
          result.text,
          {
            ...providerField(result),
            ...voiceGateProvenance(result),
            ...(leaks.length === 0 ? {} : { answerLeaks: leaks }),
          },
          { model: result.model, modelVersion: result.modelVersion },
        );
      } catch {
        if (controller.signal.aborted) {
          /* Stopped part way: the part the researcher saw is the answer, marked cut short. */
          if (accumulated.trim() !== "") {
            const asked = client.requestedModel ?? "unknown";
            await finish(accumulated.trim(), { cutShort: true, ...providerField(client) }, { model: asked, modelVersion: asked });
          }
        } else {
          setFailed({ ...request, askedId: id });
        }
      } finally {
        stopper.current = null;
        setStreaming(null);
      }
    },
    [about, choose, dataIds, keepLocal, ledger, local, page, project, station],
  );

  const busy = streaming !== null;
  const submit = () => {
    const text = draft.trim();
    if (text === "" || busy || !connected) return;
    setDraft("");
    void send({ text });
  };

  /* M95c: newest exchange first, straight under the box, so the answer to the
     request just sent is the first thing under the question box. */
  const newestFirst = [...shown].reverse();
  const streamingBubble = busy ? (
    <p className="help-chat-turn" data-who="abductive" aria-live="polite" data-testid="help-chat-streaming">
      <span className="help-chat-who">Abductive</span>
      {streaming === "" ? "Abductive is writing…" : streaming}
    </p>
  ) : null;

  return (
    <section className="help-chat" aria-labelledby={headingId} data-testid="help-chat">
      <h3 className="page-help-subhead" id={headingId}>
        {HELP_CHAT_HEADING}
      </h3>
      {!connected ? (
        <p className="small muted" data-testid="help-chat-offline">
          {HELP_OFFLINE_LINE}{" "}
          <a
            className="linkish"
            href="#/settings"
            onClick={(e) => {
              e.preventDefault();
              navigate("#/settings");
            }}
            data-testid="help-chat-connect"
          >
            Connect a model
          </a>
        </p>
      ) : (
        <>
          <div className="help-chat-controls">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void send({ text: STUCK_WORDS, stuck: true })}
              data-testid="help-chat-stuck"
            >
              I'm stuck
            </button>
          </div>
          <textarea
            className="help-chat-input"
            aria-label="Your question"
            placeholder="For example: which step should I answer next?"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (!sendsOnKey(e)) return;
              e.preventDefault();
              submit();
            }}
            data-testid="help-chat-input"
          />
          <div className="help-chat-controls">
            {busy ? (
              <button type="button" className="btn-quiet" onClick={() => stopper.current?.abort()} data-testid="help-chat-stop">
                Stop
              </button>
            ) : (
              <button type="button" className="btn-quiet" onClick={submit} data-testid="help-chat-send">
                Send
              </button>
            )}
          </div>
        </>
      )}
      {failed !== null && !busy && (
        <p className="small help-chat-failed" role="alert" data-testid="help-chat-failed">
          {HELP_FAILED_LINE}{" "}
          <button type="button" className="btn-bare linkish small" onClick={() => void send(failed)} data-testid="help-chat-retry">
            Try again
          </button>
        </p>
      )}
      {newestFirst.length > 0 && (
        <ol className="help-chat-thread" data-testid="help-chat-thread">
          {newestFirst.map((x, i) => (
            <li key={x.id} className="help-chat-exchange">
              <p className="help-chat-turn" data-who="you">
                <span className="help-chat-who">You</span>
                {x.text}
              </p>
              {x.answer !== undefined ? (
                <p className="help-chat-turn" data-who="abductive" data-testid="help-chat-answer">
                  <span className="help-chat-who">Abductive</span>
                  {x.answer}
                </p>
              ) : i === 0 ? (
                streamingBubble
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {newestFirst.length === 0 && streamingBubble}
      {project === undefined && (
        <p className="small muted help-chat-note" data-testid="help-chat-outside">
          {HELP_OUTSIDE_PROJECT_LINE}
        </p>
      )}
      {props.aboutPage}
      <AboutYouFold about={about} onSave={setAbout} />
    </section>
  );
}

/** About you, folded under the page's help (M95c), closed until the researcher opens it. */
export function AboutYouFold(props: { readonly about: AboutYou; readonly onSave: (about: AboutYou) => void }) {
  const { about, onSave } = props;
  const [form, setForm] = useState<AboutYou>(about);
  const [open, setOpen] = useState(false);
  const ids = useId();
  const set = (patch: Partial<Record<keyof AboutYou, string>>) => setForm((f) => ({ ...f, ...patch }) as AboutYou);
  const save = () => {
    writeAboutYou(form);
    const kept = readAboutYou();
    onSave(kept);
    setForm(kept);
    if (aboutYouFilled(kept)) setOpen(false);
  };
  return (
    <details
      className="help-about"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-testid="help-about"
    >
      <summary>About you</summary>
      <p className="small muted">{ABOUT_YOU_LINE}</p>
      <label className="help-about-field" htmlFor={`${ids}-stage`}>
        <span>{ABOUT_YOU_FIELDS.stage.label}</span>
        <span className="small muted">{ABOUT_YOU_FIELDS.stage.help}</span>
        <select
          id={`${ids}-stage`}
          value={form.stage ?? ""}
          onChange={(e) => set({ stage: e.target.value as CareerStage })}
          data-testid="help-about-stage"
        >
          <option value="">Choose one</option>
          {CAREER_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="help-about-field" htmlFor={`${ids}-field`}>
        <span>{ABOUT_YOU_FIELDS.field.label}</span>
        <span className="small muted">{ABOUT_YOU_FIELDS.field.help}</span>
        <input
          id={`${ids}-field`}
          type="text"
          value={form.field ?? ""}
          placeholder="For example: organization theory"
          onChange={(e) => set({ field: e.target.value })}
          data-testid="help-about-field"
        />
      </label>
      <label className="help-about-field" htmlFor={`${ids}-experience`}>
        <span>{ABOUT_YOU_FIELDS.experience.label}</span>
        <span className="small muted">{ABOUT_YOU_FIELDS.experience.help}</span>
        <select
          id={`${ids}-experience`}
          value={form.experience ?? ""}
          onChange={(e) => set({ experience: e.target.value as QualExperience })}
          data-testid="help-about-experience"
        >
          <option value="">Choose one</option>
          {QUAL_EXPERIENCE.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="help-about-field" htmlFor={`${ids}-wants`}>
        <span>{ABOUT_YOU_FIELDS.wants.label}</span>
        <span className="small muted">{ABOUT_YOU_FIELDS.wants.help}</span>
        <textarea
          id={`${ids}-wants`}
          rows={2}
          value={form.wants ?? ""}
          placeholder="For example: a dissertation topic that I can defend"
          onChange={(e) => set({ wants: e.target.value })}
          data-testid="help-about-wants"
        />
      </label>
      <div className="help-chat-controls">
        <button type="button" className="btn" onClick={save} data-testid="help-about-save">
          Save
        </button>
      </div>
    </details>
  );
}
