/**
 * The Help panel's words, one entry per page (M62, ISC-600).
 *
 * The owner, 2026-09-30: "Remove explanatory sentences from the pages ...
 * Instead, there should be a help button at the top right, which is
 * contextually aware. Based on the page you're on, it should provide
 * explanations of what the page is trying to accomplish. If the user wants to
 * search for more help, there should be an option to get more help."
 *
 * So the sentences whose job was to explain a page, rather than to name a
 * control or state a fact the researcher has to act on, live here now: the
 * route ledes M32 put behind a "?" chip, the ledes over sections, the note under
 * the composer, the sentence beside the loop figure and the Learn more folds that
 * restated their page. Where one read wrong away from its page ("here", "this
 * tab", "below"), it names the place instead. What stayed on the pages: state
 * sentences, empty states, waiting-question notes, errors, the questions over
 * fields, the keys to a grid's or a table's marks, the descriptions of single
 * files and options, and the walkthrough's own text. tests/m62-help.test.ts
 * lists every sentence that moved and the words it has here.
 *
 * Each page carries its purpose in two or three sentences, the parts of the
 * page, and the walkthrough screen More help opens (counted from zero, as
 * `WALKTHROUGH_TITLES` is): the two loops for Starting point and Design, The
 * outputs of a project (M68) for the other tabs, and the screen that creates a project
 * for Projects and Model access.
 */

import { ONTOLOGY_TAB_LABEL } from "../concepts/vocabulary.ts";
import { TWO_LOOPS_LEDE_IN_HELP } from "../flow/StationLoop.tsx";
import { ADD_NOTE } from "../flow/PaperExpectations.tsx";
import { STUDY_TABS, type StudyTab } from "./routes.ts";
import { STAGE_LINE } from "./stageLine.ts";

/**
 * How Abductive asks, on Starting point and on Design (M84, ISC-703 and
 * ISC-708, after a co-author's third review): the stage, the unit of analysis
 * and where to name it, the big picture before detail, and free movement
 * between the steps.
 */
const HOW_ABDUCTIVE_ASKS: HelpPart = {
  name: "How Abductive asks",
  says: [
    STAGE_LINE,
    "Identify your unit of analysis at Context, beside your setting: a person, a team, an organisation, a community, a field, or another unit that you type under Other. Abductive asks every question at that level.",
    "At each step, Abductive asks first for the big picture, and asks for detail once you've saved an answer there.",
    "You can answer the steps in any order and leave a question open. Move to another step whenever you like, and the question stays at its own step and in History.",
  ],
};

export type HelpPage = StudyTab | "studies" | "settings";

export const HELP_PAGES: readonly HelpPage[] = [...STUDY_TABS, "studies", "settings"];

export interface HelpPart {
  /** The part's name as the page shows it. */
  readonly name: string;
  readonly says: readonly string[];
}

export interface PageHelp {
  /** The page's name, as its heading or tab reads. */
  readonly title: string;
  readonly purpose: readonly string[];
  readonly parts: readonly HelpPart[];
  /** The walkthrough screen More help opens. */
  readonly screen: number;
}

/** The composer's moves, on every page with a conversation. */
const MOVES: readonly string[] = [
  // M69, ISC-642: "Not now" went; a researcher who wants to leave a question moves on.
  "I don't know and Ask me differently are replies too.",
  "Ask me differently puts the question another way and leaves the answer to you.",
  "Abductive records each of these replies. Pass on one topic three times and Abductive stops raising it.",
  /* M74b, ISC-664: the wait and a failed call. */
  "While Abductive writes, the box takes your reply, and your reply goes once Abductive finishes.",
  "When Abductive can't reach the model, the chat says so with Try again, which asks for the same turn. Your message stays in the chat, and Try again is still there after you leave the step and come back.",
];

/**
 * History, which the header opens over every study page. The first sentence
 * was the History panel's own Learn more fold.
 */
export const HISTORY_HELP: HelpPart = {
  name: "History",
  says: [
    "History keeps every event in the order that it happened.",
    "Under the list sit three readings of the session: where your attention fell, which steps you worked, and the movement of your ontology.",
    "Press History at the top right to open the list over the page that you're on.",
    "The list dates from your project's first event. Under Kinds one by one, a change to your ontology counts every change to a concept, a relation or a statement. The Who filter lists you and Abductive.",
    /* M78a, ISC-680. */
    "Under Kinds one by one, your reply and Abductive's reply are two kinds, each with its own count.",
  ],
};

export const PAGE_HELP: Readonly<Record<HelpPage, PageHelp>> = {
  motivation: {
    title: "Starting point",
    purpose: [
      "Starting point collects the three things that a project starts from: your interest, the literatures that you expect to draw on and the journal that you're aiming at.",
      "You talk each part through with Abductive in the chat. Under each summary, Auto-generate summary from chat writes that summary from the conversation, and Edit summary opens it for you to write or change.",
    ],
    parts: [
      HOW_ABDUCTIVE_ASKS,
      {
        name: "Chat",
        says: [
          "Talk your starting point through. Auto-generate summary from chat turns this conversation into the summary above the control.",
          "Abductive asks about your interest first, then the literatures, then the journal, one question at a time.",
          "A part that you haven't settled yet is a complete answer. Say so, and Auto-generate summary from chat leaves that summary for you to fill.",
          ...MOVES,
        ],
      },
      {
        name: "Your answers",
        says: [
          "Auto-generate summary from chat writes one summary in two to five sentences from your replies, keeps your phrasing, and leaves out your questions and asides. Each summary stays as text until you press Edit summary. Save answer makes a summary yours.",
          "A part that you answered in the chat gets a summary in your words. A part missing from the conversation comes back as a marked gap.",
          "Each summary has its own Save answer. An edit stays in its field, unsaved, until you press Save answer, and a dot on the Starting point tab marks an edit that you haven't saved yet.",
          "Answer these three questions once and revise them as the project changes.",
          "Under Literatures, a line with an author and a year, such as Hallen 2008, becomes a paper on Sources.",
        ],
      },
      HISTORY_HELP,
    ],
    screen: 1,
  },
  design: {
    title: "Design",
    purpose: [
      "Design asks the eight questions that make up your project, one step at a time and in any order.",
      "Your answers on Design shape every question that Abductive asks you.",
    ],
    parts: [
      {
        name: "Steps",
        /* M83, ISC-698: the figure is the framework, and the lede is the front page's,
         * without its "below" (M86, ISC-718). */
        says: [
          TWO_LOOPS_LEDE_IN_HELP,
          /* M84, ISC-705: the gate is said once, here; the M86 lede no longer names it. */
          "Sample and Early data open once you have answered all six steps in the loops.",
        ],
      },
      HOW_ABDUCTIVE_ASKS,
      {
        name: "Chat",
        says: [
          "Talk each step through with Abductive in the chat. The step's question opens the chat, and Abductive's first turn leads into the question.",
          ...MOVES,
          "After you accept a first concept, Abductive says so if your last eight answers left your concepts unchanged. You can carry on, narrow the question, or add data.",
        ],
      },
      {
        name: "Summary",
        says: [
          "One statement of the points that this conversation has settled. Abductive saves your words exactly as you wrote them.",
          "Auto-generate summary from chat writes the step's summary in two to five sentences from your replies, keeps your phrasing, and leaves out your questions and asides. The summary stays as text until you press Edit summary. Save answer makes the summary yours.",
          "After a save, the lines under Save answer about suggestions belong to that step, and another step shows only its own.",
          "At Early data, the type of data comes from the list that Sources uses for a file, and Abductive keeps your choice when you leave the step."
        ],
      },
      HISTORY_HELP,
    ],
    screen: 1,
  },
  material: {
    title: "Sources",
    purpose: [
      "Sources keeps the papers that you expect to draw on and the data that you've collected.",
      "Your data grounds the claims in your ontology. At the Early data step, Abductive reads your data to suggest more claims.",
    ],
    parts: [
      {
        name: "Papers",
        says: [
          "Identify the papers that you expect to draw on. Abductive reads each paper for its expectations (what the paper leads readers to expect) and to see which conversation you're joining. Your evidence is your own data, which you add once you say you have some.",
          /* M85, ISC-712: Sources is open from the start. */
          "You can add papers from the first moment of a project. Abductive judges each paper once you've saved an answer at Context or the Puzzle, and shows a note beside the paper until then.",
          /* M78a, ISC-678. */
          "Abductive marks a paper Identified until you upload it, and reads a paper only from its text. In an older project, the expectations that Abductive wrote from a citation sit under Written from the citation alone.",
          "Abductive files anything that you add under Papers as a paper, and reads each paper to place your project in a conversation.",
          "Papers that you add on Sources join the literatures that you identified at Starting point. A line with an author and a year becomes a paper, and a line of prose names a literature.",
          "To check a claim's grounds, Abductive reads your data instead.",
          "A suggestion joins your ontology only when you accept it.",
          /* M83, ISC-700: the control's sentence, as Sources prints it. */
          ADD_NOTE,
        ],
      },
      {
        name: "Data",
        says: [
          "Add your transcripts, fieldnotes, memos and archives. Your claims cite this data.",
          "Everything that you're building this project on. You can see which passages you have opened and which you haven't.",
          "Adding a file doesn't send it anywhere or read it. Press Read the data in this section, or at the Early data step on Design, and Abductive suggests concepts and statements from your data.",
          "The file types here are the types that the Early data step offers.",
        ],
      },
      HISTORY_HELP,
    ],
    screen: 2,
  },
  /* M63, ISC-614: the two pages in the owner's terms (2026-09-30). */
  ontology: {
    title: ONTOLOGY_TAB_LABEL,
    purpose: [
      "The concepts that you define for this project, with their definitions, properties and relations. Your ontology comes before coding, and it guides the data that you collect next.",
      "Abductive suggests concepts after you save a summary at a step or read your data, and you accept, refine or reject each one.",
    ],
    parts: [
      /* M82, ISC-695 and ISC-696: the paragraph at the tab's top. */
      {
        name: "The argument so far",
        says: [
          "At the top of the tab, Abductive writes the argument so far in two to four sentences, from your accepted concepts and relations.",
          "Abductive writes the paragraph again after you accept or refine a card, so the paragraph keeps up with your ontology.",
          "Read the paragraph to check that your cards add up to the argument that you mean to make.",
        ],
      },
      /* M70, ISC-648: one part per kind, as the page has one section per kind. */
      {
        name: "Concepts",
        says: [
          "Abductive suggests concepts after you save a summary at a step or read your data, and writes [...] in place of anything that you did not say. You see at most three suggested concepts, three suggested relations and six suggested statements at once; Abductive keeps the rest in a queue, and shows the next when you decide one. Each suggestion sits first under Concepts, marked Suggested, with Accept, Refine and Reject on its card.",
          /* M90, ISC-734 (the owner, 2026-10-14): concepts as nouns and gerunds. */
          "Each concept that Abductive suggests is one noun or gerund, such as introductions or founders, and the relations carry the joins between concepts.",
          "Each card on the page is a preview: the name, the first sentence of the definition, and a count of the properties, statements, passages and answers on the card. With Read more, you open the whole card over the page, with every passage and answer in full, and a long passage scrolls inside its own box.",
          "Accept, Refine and Reject sit on the open card too. Once you decide on the open card, Abductive closes the card. Press Escape, Close or anywhere outside the card to close the card yourself. The page beneath stays where it was.",
          "Accept a concept and the concept joins your ontology with its properties and statements. Refine a concept to put the concept in your own words first. Reject a concept with a reason, and Abductive keeps your reason in History.",
          "Your accepted concepts follow the suggestions. Open an accepted concept with Read more to read the concept's definition, properties (the aspects that vary), relations to other concepts, the statements that you placed under the concept, and the passages or answers behind the concept.",
          "Five relations can join two concepts: is part of, leads to, varies with, contrasts with, and is a condition for.",
          "Each concept and each statement carries its authorship mark (yours, from the data, or AI-suggested), and the mark is permanent.",
          "Abductive marks each suggestion with its source: your summary at a step, the data, or the papers. Abductive suggests a statement once, and leaves out a statement that repeats a sentence of your summary word for word.",
          /* M82, ISC-695. */
          "Each card carries a Why it matters line: one or two sentences on the work that the concept or relation does for your argument, and on the gap that your design would have without it.",
          "Abductive writes the line from your puzzle, the expectation in your puzzle that the card relates to, and the card's statements. You read a suggestion's line before you accept the suggestion.",
          "On an accepted card, a line that Abductive wrote stays marked Suggested until you accept it. Refine the card to put the line in your own words, and Abductive marks the line Yours.",
          /* M82, the lead's ruling A. */
          "Retire concept drops a concept that turned out empty, with your reason. The concept leaves your ontology and the map, you remove its relations with it, and its statements go back to Statements to place. History keeps the concept and your reason.",
        ],
      },
      {
        name: "Relations",
        says: [
          "Abductive suggests relations on the same occasions as concepts, and writes [...] in place of anything that you did not say. Each suggestion sits first under Relations, marked Suggested, with Accept, Refine and Reject on its card, and you open the whole relation over the page with Read more, as for a concept.",
          "A relation is a card of its own, like a concept. Open a relation card with Read more to read the two concepts, the kind (is part of, leads to, varies with, contrasts with, or is a condition for), the claim in one sentence of yours, the conditions under which you expect the relation to apply, the statements that you placed under the relation, and the passages or answers behind the relation.",
          "A relation whose claim you haven't written yet shows Write claim. Edit conditions writes the conditions, and Refine changes the kind or the claim, and Abductive keeps what the relation first said.",
          "When Abductive proposes a relation from a link that you drew between two claims, such as one claim that contradicts another, you see that link on the relation card.",
          /* M82, ISC-694 and ISC-696. */
          "Each relation card carries a Why it matters line too, which you accept or refine as on a concept.",
          "When Abductive suggests a new concept, Abductive also suggests a relation from the new concept to a concept that you've accepted, where your words support one.",
          "Press Suggest relations, and Abductive reads every accepted concept with its definition and statements, and suggests up to three relations among them. Each suggested relation shows the statements that it rests on.",
          "Abductive does the same after you accept a concept, once you have three or more, when your newest concept stands alone.",
          "A concept stands alone when you haven't related it to another concept yet. A concept that stands alone has its part in your argument still to come.",
        ],
      },
      {
        name: "Links between cards",
        says: [
          "On a concept card, each relation line is a link that opens the relation card. On a relation card, each concept name is a link that opens the concept card.",
          "A link scrolls the card into view and rings the card for a moment, and the address carries the card, so you can copy the link and share the card within the project.",
          "While a card is open over the page, the address carries the open card, so a reload opens the card again.",
        ],
      },
      {
        name: "Statements to place",
        says: [
          "Abductive suggests statements on the same occasions as concepts and relations, and those statements come first under Statements to place, marked Suggested. Each suggested statement names its proposed home: a concept or relation in your ontology, or one that Abductive suggests beside the statement. Choose another home on the statement's card before you accept, or choose New concept or New relation and write the home yourself. Accept, and Abductive places the statement there in one entry in History.",
          "Each claim that your project already has is a statement, with a label of its origin: the step summary, your replies at a step, the document that Abductive read it from (such as Fieldnote 2), the papers or a rival.",
          "Under Statements to place, after the suggested statements, you find each statement from a step summary, your replies at a step or a read of your data that you haven't placed under a concept or a relation yet.",
          "A claim from the papers and a rival stay under All statements, with their own controls.",
          "On first open, Abductive proposes a home for each of those statements, and shows three suggested homes at a time. Accept the suggested home, or choose another one, and the next statement in the queue takes the place of the statement that you placed. Once you have placed every statement, the section is gone.",
          "On each of those cards, you see the statement's first sentence and its proposed home, with Accept. With Read more, you open the whole statement over the page, with every passage or answer behind the statement in full.",
        ],
      },
      {
        name: "What to look for in the field",
        says: [
          "Abductive writes one line of things to observe or ask next for each concept with an undefined property or without a passage or an answer behind the concept, and for each relation without a passage or an answer behind the relation, in the words of the relation's claim.",
          "Settle a line yourself, or Abductive settles the line when a later passage shows the relation.",
          /* M82, ISC-695. */
          "Under each line, you see the property, the relation or the concept that you settle with the line.",
        ],
      },
      {
        name: "Concept map",
        says: [
          /* M81, ISC-692: the frame below both columns, its handle and Expand (M79's fold went). */
          "You find the map below both columns, in its own frame across the tab. In the frame's header, you see Concept map and the count of the concepts and relations on the map.",
          "Drag the handle on the frame's top edge up to open the map, or down to close the frame to its header. With the handle in focus, press an arrow key to move the handle a step, Home to close the frame or End to open the whole map.",
          "The frame starts closed. Drag the frame open, and the frame opens as far as the map's height, up to three fifths of the window. Abductive keeps the height that you set for the project in this browser. When the frame is shorter than the map, scroll inside the frame.",
          "With Expand, you open the map over the page at the size of the window, for reading a large map. Press Escape or Close to close the map.",
          "On the map, you see every concept and relation in your ontology: accepted ones solid, and suggested ones dotted, with a suggested ring.",
          "A suggested concept that is the proposed home of a statement to place is faint.",
          "Press an accepted concept or line to open its card, or press a dotted one to open the suggestion.",
          /* M82, ISC-693 and ISC-694. */
          "Under the map, the caption also counts your accepted concepts that stand alone.",
          "Abductive keeps every label clear of the lines and the dots. A line bends once around a label in its way, and a relation's label sits beside its line or at a clear spot with a thin line back to it.",
        ],
      },
      {
        name: "Suggested claims",
        says: [
          "Claims that Abductive suggested from your papers, or as rivals, stay open under Suggested claims until you decide.",
          "Each of those claims shows the home that Abductive proposes for its statement, with the same select. Accept the claim, and Abductive places the statement at the home that you left chosen, or, when you chose Place later, lists the statement under Statements to place, or under All statements for a claim from the papers or a rival.",
          "A suggestion becomes a claim (a statement in your ontology) once you accept the suggestion. Read each suggestion, edit anything that you wouldn't defend, then decide.",
          "Reject a suggestion and it stays under Suggestions to review, struck through, with your reason. Decide later and the suggestion stays open.",
          "Edit the suggestions first. A write-up keeps the confident part of your answer and drops the hedging. The words in a write-up are usually surer than the ones that you said.",
          "Whatever you change, Abductive records the claim as the model's suggestion and keeps your edit beside the original.",
        ],
      },
      HISTORY_HELP,
    ],
    screen: 2,
  },
  /* M89 (2026-10-14): the Checks Help (M85, ISC-711) went with the tab. */
  exports: {
    title: "Export",
    purpose: [
      "Export your project. Every file comes from History, so every file matches the screen.",
    ],
    parts: [
      {
        name: "Design history",
        says: [
          "Abductive builds every file on Export from the counts under Design history. Press a count to open History at the entries behind that count.",
          /* M78a, ISC-680. */
          "An answer counts as yours if you typed it yourself or edited Abductive's summary before you saved it.",
        ],
      },
      {
        name: "Export receipt",
        says: [
          "Match a file that you sent last week back to the project that it came from, using the stamp printed inside that file.",
          "Abductive records every export under Export receipt, so the list survives closing the tab. Last exported appears after your first export.",
          "Each file prints its times in your local time zone and names the zone once. The stamp is a fingerprint of the file, so that you can match a copy back to this project.",
        ],
      },
      HISTORY_HELP,
    ],
    screen: 2,
  },
  studies: {
    title: "Projects",
    purpose: [
      "Projects lists every project in this browser, most recently changed first.",
      "Open a project from its row, start a new one or import one that someone sent you.",
    ],
    parts: [
      {
        name: "Projects table",
        says: [
          "Each row is one project, with its steps, statements, concepts and suggestions. The key beside the table gives the meaning of each column.",
        ],
      },
      {
        name: "New project",
        says: ["Name a project and press Create project to start one."],
      },
      {
        name: "Import project",
        says: ["Import project opens the JSON file of a project that someone exported and sent you."],
      },
    ],
    screen: 3,
  },
  settings: {
    title: "Model access",
    purpose: [
      "Connect a model to ask questions and suggest claims.",
      "Pick a subscription or a local model through the bridge, or a key from a model provider. Your research data stays in this browser whichever you pick.",
    ],
    parts: [
      {
        name: "Subscription or local model",
        says: [
          "The bridge is a small program on this machine. The bridge passes your questions only to the CLI or the local model that you pick.",
        ],
      },
      {
        name: "API key",
        says: [
          "A key from a model provider works on a machine without the bridge. The provider bills the key per token, against your own account with them.",
        ],
      },
      {
        name: "Privacy",
        says: ["Your research data stays in this browser. Upload anonymised or consented material only."],
      },
    ],
    screen: 3,
  },
};

/** Every word the Help panels can show, for the tests and the scan. */
export function helpText(): string {
  return HELP_PAGES.flatMap((page) => {
    const help = PAGE_HELP[page];
    return [help.title, ...help.purpose, ...help.parts.flatMap((p) => [p.name, ...p.says])];
  }).join("\n");
}
