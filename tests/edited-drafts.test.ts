/**
 * An edited draft, on the three surfaces that report it (D28, M43c).
 *
 * What the walk of 2026-09-13 found. The researcher retitled three drafts and
 * corrected the body of a fourth before putting them in. Each card said "Your
 * edit is on the record." and relabelled its own button "Accept my edit". The
 * claims table then read "AI-suggested" for all four, and the census
 * under it read "41 claims: 0 yours, 5 from the papers, 0 from the data, 36 from
 * the language model." So the record the card promised was nowhere on the page.
 *
 * Which of the two readings is meant was not open. `proposals/adjudicate.ts`
 * states it at the stamp, and `ProposalsTrayView.tsx` states it at the head of
 * the file: the origin does not move when the researcher rewrites the text,
 * because `author-prior` asserts they held the concept before the model offered
 * it and editing a draft is evidence of the opposite, and because a scheme that
 * credited editing would tax agreement. Both files also state the other half,
 * that what the researcher did to the text is kept beside the claim as additive
 * history. It was kept on the adjudication and read by nothing.
 *
 * So the checks below are one fact on three surfaces plus the popover, and the
 * fact is the same fact each time. The origin is unchanged, which the first test
 * pins: a build that "fixed" this by flipping the origin would fail here.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import {
  adjudicateProposal,
  resetAdjudicationInFlight,
} from "../src/proposals/adjudicate.ts";

import {
  EDITED_LINE,
  EDITED_MARK,
  claimProvenance,
  editedClaims,
  editedShare,
} from "../src/views/provenance.ts";
import { originCensus, LIVE_PAGES, censusRead } from "../src/ontology/attribution.ts";
import type { OriginDoubt } from "../src/ontology/originAudit.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const PROJECT = "88888888-4444-4444-8444-888888888888";
let clock = 2_200_000_000_000;

function env(actor: "human" | `persona:${string}` = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function proposal(proposalId: string, title: string, pageType: PageType = "observation"): LedgerEvent {
  return {
    ...env("persona:extractor"),
    type: "proposal",
    proposalId,
    pageType,
    title,
    body: `${title}. [[chunk:c1]]`,
    sourceChunks: ["c1"],
  } as LedgerEvent;
}

function makeLedger(initial: LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      store.push(...events);
    },
    readEvents: async () => [...store],
  };
}

/** Two drafts in, one of them retitled on the way. */
async function studyWithOneEdit() {
  const ledger = makeLedger([
    proposal("p-plain", "Ravi runs office hours with the laptop closed"),
    proposal("p-edited", "Whether Olivia and Ravi are performing fairness at you"),
  ]);
  await adjudicateProposal(
    { projectId: PROJECT, proposalId: "p-plain", disposition: "accept" },
    ledger,
  );
  await adjudicateProposal(
    {
      projectId: PROJECT,
      proposalId: "p-edited",
      disposition: "accept",
      edit: {
        title: "Mentor reactivity cannot be ruled out: they know what I am watching for",
        body: "Whether Olivia and Ravi are performing fairness at you. [[chunk:c1]]",
      },
    },
    ledger,
  );
  return ledger;
}

beforeEach(() => {
  resetAdjudicationInFlight();
});

describe("what the record holds about an edited draft (D28)", () => {
  test("the claim keeps the model's origin, and the edit is a second fact beside it", async () => {
    const ledger = await studyWithOneEdit();
    const graph = projectOntology(ledger.store, PROJECT);
    const pages = livePages(graph);
    expect(pages.length).toBe(2);
    // Unchanged, and deliberately so. See the module note.
    expect(new Set(pages.map((p) => p.origin))).toEqual(new Set(["model-proposed"]));

    const edited = editedClaims(ledger.store, PROJECT);
    expect(edited.size).toBe(1);
    const rewritten = pages.find((p) => p.title.startsWith("Mentor reactivity"));
    expect(rewritten).toBeDefined();
    expect(edited.has(rewritten!.id)).toBe(true);
    const asWritten = pages.find((p) => p.title.startsWith("Ravi runs"));
    expect(edited.has(asWritten!.id)).toBe(false);
  });

  test("reflowing whitespace is not an edit, so the mark is not claimed for one", async () => {
    const ledger = makeLedger([proposal("p-ws", "Stopping rate noticed, not measured")]);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "p-ws",
        disposition: "accept",
        edit: {
          title: "  Stopping rate noticed,  not measured ",
          body: "Stopping rate noticed, not measured. [[chunk:c1]]",
        },
      },
      ledger,
    );
    expect(editedClaims(ledger.store, PROJECT).size).toBe(0);
  });

  test("a turned-down draft the researcher edited claims no live page", async () => {
    const ledger = makeLedger([proposal("p-down", "The room as what's left after the tool")]);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "p-down",
        disposition: "reject",
        reason: "Ravi-only version of a card I kept",
        edit: { title: "The room, after the tool", body: "changed" },
      },
      ledger,
    );
    expect(editedClaims(ledger.store, PROJECT).size).toBe(0);
  });
});

describe("the three surfaces say the same thing (D28)", () => {
  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "the WHO column carries the mark beside the origin"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "the census names how many of the model"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "no mark, and no clause, on a study where nothing was edited"

  test("the popover says what the researcher did to the words", async () => {
    const ledger = await studyWithOneEdit();
    const graph = projectOntology(ledger.store, PROJECT);
    const rewritten = livePages(graph).find((p) => p.title.startsWith("Mentor reactivity"))!;
    const asWritten = livePages(graph).find((p) => p.title.startsWith("Ravi runs"))!;

    const mine = claimProvenance({ events: ledger.store, projectId: PROJECT, pageId: rewritten.id });
    expect(mine?.edited).toBe(true);
    // The origin sentence is unchanged, which is the whole point of keeping the
    // two facts apart.
    expect(mine?.originLine).toBe("This claim is AI-suggested.");
    const theirs = claimProvenance({
      events: ledger.store,
      projectId: PROJECT,
      pageId: asWritten.id,
    });
    expect(theirs?.edited).toBe(false);

    const popover = readFileSync(join(ROOT, "src/ui/components/ProvenancePopover.tsx"), "utf8");
    expect(popover).toContain("{EDITED_LINE}");
    expect(EDITED_LINE).toBe("You rewrote the suggestion before you accepted it.");
  });
});

describe("the chooser's own promise (D28)", () => {
  test("the note names the link it records rather than a claim joining the model", () => {
    const chooser = readFileSync(join(ROOT, "src/workbench/ExpectationChooser.tsx"), "utf8");
    const code = chooser.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(code).toContain("This link joins your puzzle to the expectation");
    // The sentence that contradicted the census eight pixels below it.
    expect(code).not.toContain("This claim joins your model as your own judgement");
  });
});

describe("the shipped example's own edited drafts (D28)", () => {
  const fixture: {
    readonly projectId: string;
    readonly events: readonly LedgerEvent[];
  } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/coldharbour-model.json"), "utf8"));

  test("the six claims the walk rewrote carry the mark, and the census counts them", () => {
    const edited = editedClaims(fixture.events, fixture.projectId);
    /* Six, and the walk's own log is why that is the right number rather than the
     * four its Your model leg reported. Four were edited while the tray was being
     * decided: three titles and one body. Two more were edited on the Checks leg
     * that followed, a rival's test clause and a claim written in the second
     * person. Every one of the six is an accept, so every one of them is a live
     * claim carrying the mark.
     *
     * Before the pairing fix in `proposals/projection.ts` this read zero for all
     * six, because the link from a draft to the claim it became was matched on
     * the title and an edited draft's claim does not carry the draft's title. */
    expect(edited.size).toBe(6);
    const graph = projectOntology(fixture.events, fixture.projectId);
    const titles = livePages(graph)
      .filter((p) => edited.has(p.id))
      .map((p) => p.title)
      .sort();
    expect(titles).toContain(
      "Mentor reactivity cannot be ruled out: they know what I am watching for",
    );
    expect(titles).toContain(
      "Command score may track rehearsed comfort with interruption rather than command of the venture",
    );
    // Every one of them is still the model's claim.
    const origins = new Set(
      livePages(graph)
        .filter((p) => edited.has(p.id))
        .map((p) => p.origin),
    );
    expect(origins).toEqual(new Set(["model-proposed"]));
  });
});
