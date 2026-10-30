# Abductive

Abductive is a prototype tool that helps a researcher design an early-stage qualitative study. You describe the setting, the process, the outcome and the site that you care about. Abductive then asks the questions that a careful colleague would ask, one at a time, drafts the concepts and relationships that your answers and your data raise for you to accept, refine or reject, and records every change and who made it.

This repository is the research artifact for a Stage 1 proposal to the *Organization Science* special issue "AI-Enabled Frontiers in Organizational Science", by Matthew G. Grimes (Cambridge Judge Business School) and Stine Grodal (Northeastern University). The technical appendix is [`docs/TECHNICAL_APPENDIX.md`](docs/TECHNICAL_APPENDIX.md).

## Running it on your own machine

Abductive runs in your browser. Your projects stay in that browser, and your questions go only to the model provider that you choose. Abductive runs without a server of its own.

Requirements: [Bun](https://bun.sh) 1.2 or later, and one way of reaching a model (see below).

```
git clone https://github.com/mggrim/abductive-orgsci.git
cd abductive-orgsci
bun install
bun run dev
```

Then open http://localhost:5173. `bun run dev` starts the app and a small local bridge together. If Abductive can't reach a model, the app says "Abductive is running without a model." at the top, and every answer is a canned fixture until you connect one under **Model access**.

When you don't know what to do next in the app, press **?** at the top right of the page. The Help panel opens on a help chat that knows the page, your project and, if you fill in **About you**, your stage and field. The chat explains what the step needs and leaves the writing to you.

If you are not a programmer, [SETUP.md](SETUP.md) gives you one message to paste into Claude Code, and Claude Code does the rest.

## Reaching a model

Open **Model access** in the app and pick one of three routes.

**A Claude or ChatGPT subscription.** If you have installed Claude Code or OpenAI's Codex on your machine and signed in, the local bridge runs each turn through it. A Claude Code sign-in works without an API key, and a Team or Enterprise seat works too when your organization has turned Claude Code on. The bridge switches off every tool, plugin, skill and setting of the command-line tool, so the turn sees only Abductive's instructions, and the bridge listens only on your own machine.

**An API key.** Pick the provider (Anthropic, OpenAI, Google Gemini, OpenRouter or another OpenAI-compatible service), paste the key and press **Connect**. The key stays in this browser tab's session storage, off the disk and off every server. The provider charges your own account.

**A local model.** If you serve a model on your machine with Ollama, LM Studio, llama.cpp or any OpenAI-compatible server, the bridge finds it on the usual ports (11434, 1234, 8080, 8000). Your data then stays on your machine, so this is the route for material that you can't send to a provider.

History records the provider, the model and its version for every turn that a model wrote.

## Replaying the example

`examples/auditing-judgement.bundle.json` is a walk of record: a complete project exported from Abductive with its full event history, in which a second-year PhD student finds a dissertation topic on how junior auditors learn judgement after automation (17 October 2026). To open it, start the app, go to **Projects**, press **Import project** and pick the file. You can read the conversation, the emerging project ontology and the full History without connecting a model. `examples/auditing-judgement.report.md` is the report that Abductive exported from the same project.

The walk is synthetic. An AI agent played the researcher and wrote the researcher's replies and the fictional data files, while Abductive answered as itself through Claude Code. Every participant and every data file in it is fictional.

## Tests

```
bun test
bun x tsc --noEmit
```

## What is in the repository

- `src/` the app (React, TypeScript, Vite)
- `scripts/cli-bridge.ts` the local bridge from the browser to Claude Code, Codex, a local model server or an API relay
- `bridge-app/` source for Abductive Bridge, a macOS menu-bar app that runs the same bridge natively (`bridge-app/build.sh` builds it; it needs Xcode and XcodeGen)
- `content/creeds/` the methodological stances for the planned challenge personas
- `examples/` the walk of record (see above)
- `docs/TECHNICAL_APPENDIX.md` the technical appendix for the proposal
- `docs/copy-standard.md` the writing standard that every string in the app meets
- `tests/` the test suite

## License

MIT. See [LICENSE](LICENSE).
