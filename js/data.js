// Every fact here comes from the project's own README, HANDOFF or live site. Nothing is invented.

export const OWNER = {
  name: "The New Urban Kid",
  line: "Builder of games, tools and AI agent systems.",
  github: "https://github.com/thenewurbankid-web",
};

export const WORLDS = [
  {
    id: "orbit",
    name: "Orbit",
    pitch: "A live mission-control view of Paperclip AI companies, drawn as a realistic space scene.",
    facts: [
      "Each Paperclip project is a planet; its agents are moons and its issues are satellites.",
      "Opens with a cinematic door intro, then shows agents working, work in progress, blocked items and questions waiting on you.",
      "Pairs with the Mac board by QR code, then talks to it directly over WebRTC.",
      "Makes no server calls of its own and stores nothing secret; a demo mode runs on made-up companies.",
    ],
    tags: ["three.js", "WebRTC", "Paperclip"],
    links: [
      { label: "Enter", href: "https://thenewurbankid-web.github.io/orbit/" },
      { label: "Source", href: "https://github.com/thenewurbankid-web/orbit" },
    ],
    preview: "assets/orbit.webp",
    look: "ocean",
  },
  {
    id: "quest",
    name: "A Vibe Called Quest",
    pitch: "A cozy 3D quest world where your AI work becomes quests.",
    facts: [
      "Each project is a town; its state comes from files: git, docs and Claude Code transcripts.",
      "Narration comes from a local Ollama model, so the game spends no Claude tokens talking to you.",
      "Keepers are summoned with Ember and take on Works; Marches open as regions beyond the hub.",
      "The Bridge hands opted-in work to real agents. It starts halted, and only the game can open it.",
    ],
    tags: ["three.js", "Ollama", "MQTT"],
    links: [
      { label: "Enter", href: "https://thenewurbankid-web.github.io/claude_quest/" },
      { label: "Source", href: "https://github.com/thenewurbankid-web/claude_quest" },
    ],
    preview: "assets/quest.webp",
    look: "violet",
  },
  {
    id: "ruckus",
    name: "Bring The Ruckus",
    pitch: "A photoreal hip-hop street-boxing game, built phone first.",
    facts: [
      "A seeded, deterministic fight sim: the same fight plays out the same way every time.",
      "Career mode: gym drills, rest weeks and fight cards, with offers fixed by the career seed.",
      "Fight a friend peer to peer over WebRTC; both sides see the same result.",
      "Broadcast-style 3D in Babylon.js: rigged boxers, a crowd, street courts by day and night.",
    ],
    tags: ["Babylon.js", "WebRTC", "Phone first"],
    links: [
      { label: "Enter", href: "https://thenewurbankid-web.github.io/bring-the-ruckus/" },
      { label: "Source", href: "https://github.com/thenewurbankid-web/bring-the-ruckus" },
    ],
    preview: "assets/ruckus.webp",
    look: "ember",
    graffiti: true,
  },
  {
    id: "line",
    name: "Line framework",
    pitch: "Front-end development as a chain of deterministic blocks with closed options, AI-ready and System 1 first.",
    facts: [
      "Rules and fixed blocks decide; a model only fills what remains once the structure is fixed.",
      "Construct is the framework and command line, open source under MIT. The Cockpit is the browser app you work in.",
      "Vision rebuilds screenshots and specs into reusable Line components with local models.",
      "The MVP aim: from a sentence to a validated, proven screen, by clicking.",
    ],
    tags: ["React", "TypeScript", "Node 20"],
    links: [
      { label: "Enter", href: "https://thenewurbankid-web.github.io/construct/" },
      { label: "Source", href: "https://github.com/thenewurbankid-web/construct" },
    ],
    preview: "assets/construct.webp",
    look: "ice",
    moons: ["construct", "vision"],
  },
];

export const MOONS = [
  {
    id: "construct",
    parent: "line",
    name: "Construct",
    kicker: "Line framework · moon",
    pitch: "AI guesses. Construct computes: small deterministic blocks that do the same job the same way, under rules you write down.",
    facts: [
      "One file, architecture.yml, says where things live; construct validate names each broken rule with the reason and the fix.",
      "Create, move, rename and review code with commands that need no model: same input, same result, zero tokens.",
      "A model is optional: --llm fills one file at a time with Claude or a local Ollama model, only when asked.",
      "Version 0.9.0, the MVP release, for Next.js App Router and client-routed React apps.",
    ],
    tags: ["CLI", "TypeScript", "MIT"],
    links: [
      { label: "Enter", href: "https://thenewurbankid-web.github.io/construct/" },
      { label: "Source", href: "https://github.com/thenewurbankid-web/construct" },
    ],
    preview: "assets/construct.webp",
    look: "rock",
  },
  {
    id: "vision",
    parent: "line",
    name: "Vision",
    kicker: "Line framework · moon",
    pitch: "A local-model pipeline that turns screenshots and specs into reusable Line components.",
    facts: [
      "Cuts pages into blocks, describes each in plain English, then rebuilds it from that description: clean-room, never copied.",
      "Every component is checked by tools and stored with its tests in a searchable library, then reused on later pages.",
      "Runs on local models through Ollama; every action and decision goes into an audit ledger.",
      "A knowledge graph tracks each component's versions, where it is used and its aliases.",
    ],
    tags: ["Ollama", "TypeScript", "SQLite"],
    links: [
      // Set live: true once https://thenewurbankid-web.github.io/construct/vision/ is published (it returned 404 on 2026-10-04).
      { label: "Status", href: "https://thenewurbankid-web.github.io/construct/vision/", live: false, pending: "Status page coming" },
    ],
    note: "Private code",
    preview: null, // drawn in code: blocks flowing into a library
    look: "moon",
  },
];

export const ALL = [...WORLDS, ...MOONS];
export const byId = (id) => ALL.find((w) => w.id === id);
