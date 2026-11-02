export interface Competitor {
  name: string;
  url: string;
  oneLiner: string;
  forWho: string;
  features: string[];
  pricing: string;
  privacy: string;
  overlap: string;
}

/* Hand-researched from each company's public site, 2026-11-02. Re-check before relying on prices. */
export const COMPETITORS_CHECKED = "2026-11-02";

export const COMPETITORS: Competitor[] = [
  {
    name: "Aicoo",
    url: "https://www.aicoo.io",
    oneLiner: "An AI “COO” workspace: docs, to-dos and meetings in one place. “I propose, you approve.”",
    forWho: "Small teams that share work, plus individuals who want docs, to-dos and meeting follow-up together.",
    features: [
      "Docs and folders with visible access settings; to-dos and a Today view",
      "Meetings with live captions, transcript, and notes/decisions/to-dos pulled out",
      "Chat assistant that suggests edits and waits for approval",
      "Claude Code, Codex, Cursor, OpenClaw and OpenHands connect with one pasted line; read-only access available",
      "Imports from Notion, Google Docs, OneNote; web, Mac, Windows, iOS, Android",
    ],
    pricing: "Free $0 (300 credits/mo) · Pro $15/mo · Max $200/mo · Team $15/person/mo (min 3).",
    privacy: "Checks access on every request. The public page does not say where data is stored, for how long, or how it is encrypted.",
    overlap: "Both connect to coding agents and “remember” things. Aicoo is a shared work hub; EZ Wallet is a private personal vault.",
  },
  {
    name: "MemoryPlugin",
    url: "https://memoryplugin.com",
    oneLiner: "“One memory across 21+ AI tools.” A paid memory layer you control.",
    forWho: "People who use AI daily and are tired of re-explaining projects and preferences in every chat.",
    features: [
      "Browser extension, MCP server, Custom GPT, API and a free macOS sync app",
      "Imports history from ChatGPT, Claude, Gemini, Grok, DeepSeek and TypingMind",
      "Memory buckets (work, personal, projects); you approve every merge or change",
      "Plain-language search across memories, files and chat history, with sources",
    ],
    pricing: "Core $89/yr · Pro $180/yr · monthly and lifetime options; 7-day trial, 14-day refund.",
    privacy: "Encrypted in transit and at rest; says it never sells data or trains on it; export and delete anytime.",
    overlap: "The closest product to EZ Wallet’s core idea. The server holds your memories; no PIN-locked vault or warn-before-you-send check is advertised.",
  },
  {
    name: "Mem0",
    url: "https://mem0.ai",
    oneLiner: "An AI memory platform for agents and LLM apps (62k+ GitHub stars).",
    forWho: "Developers building agents, and production teams that need limits, SSO and a contract.",
    features: [
      "Memory API with MCP integration, CLI and OpenMemory",
      "Custom plan adds graph memory, user profiles, memory consolidation, analytics",
      "SSO, audit logs, SLA, on-prem deployment",
    ],
    pricing: "Free (50k adds / 10k retrievals a month with your own LLM key) · Custom, set by agreement. The $19 and $249 plans were dropped on 27 Oct 2026.",
    privacy: "“GDPR Ready” badge and a Trust Center; encryption and retention are not described on the pricing page.",
    overlap: "Developer infrastructure, not a consumer product. It competes for the “memory layer” label, not for the person using several chatbots.",
  },
  {
    name: "Supermemory",
    url: "https://supermemory.ai",
    oneLiner: "“The best memory for agents.” A vector-graph memory engine with its own model, learner-1.",
    forWho: "Developers and teams running agents in production, including enterprises that self-host.",
    features: [
      "API, plugins and MCP; works with ChatGPT, Claude, Cursor",
      "Graph memory that understands time; profile recall; reported 187 ms search",
      "Document extraction (PDF, OCR on higher plans); runs in a VPC or air-gapped",
    ],
    pricing: "Free, Pro, Max, Scale and Enterprise tiers; prices not listed on the home page.",
    privacy: "Says SOC 2, HIPAA and GDPR aligned; DPAs available; encryption details not given.",
    overlap: "Its integrations reach the same chatbots, but it sells to builders and companies, not to individuals managing their own data.",
  },
  {
    name: "Zep",
    url: "https://www.getzep.com",
    oneLiner: "“The unified context layer for enterprise data”: governed Context Graphs for agents.",
    forWho: "Enterprises building production agents for support, procurement and renewals.",
    features: [
      "Per-user and per-account Context Graphs; every fact links to its source",
      "Policy-filtered retrieval in one call, under 200 ms stated",
      "Retention schedules, legal hold, audit logs of every access decision",
    ],
    pricing: "Enterprise plans; a free tier is mentioned but no prices are listed.",
    privacy: "SOC 2 Type II, HIPAA BAA, bring-your-own encryption keys, or deploy in your own cloud.",
    overlap: "The strongest governance story, aimed at companies. Not a personal product, but it sets the bar buyers compare against.",
  },
];
