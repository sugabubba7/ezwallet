# Competitor tracker report

- **Topic:** Competitors to EZ Wallet: products that store, encrypt or manage personal context/memory for AI chats (AI memory vaults, prompt-context managers, privacy-first LLM gateways). Track launches, pricing changes, funding, and security or privacy incidents.
- **Run:** 14 · 2026-10-05 15:18 UTC
- **Status:** COMPLETE
- **K:** 5 · **steps:** 6 · **fetches:** 6 · **tokens:** 40155 · **est. cost:** $0.0088

_First run: nothing has been reported before, so everything is new._

## New since last run

1. **LLMnesia ships optional encrypted 'Vault' backup for AI conversations, plus a Vault web app beta**  
   LLMnesia, a browser extension that indexes AI conversations locally, offers an optional paid 'Vault' feature: encrypted server backup, sync and restore using AES-256-GCM with a key derived on the user's device; LLMnesia's servers store only encrypted payloads plus a wrapped key copy. Current Vault subscribers can also use an installable Vault web app beta (vault.llmnesia.com) that downloads encrypted records from Supabase and decrypts/indexes them locally to search and ask questions over synced conversations. This is a close analogue to EZ Wallet's encrypted, zero-retention personal-context model, now adding a hosted encrypted-sync tier.
  - [Privacy Policy](https://www.llmnesia.com/privacy-policy) (www.llmnesia.com) — "Vault is a separate, optional paid feature that adds an encrypted server backup, sync, and restore. Current Vault subscribers may also use an installable Vault web app beta to search and ask questions over an existing synced Vault."

2. **Engram Vault Sync: Obsidian plugin turns your vault into AI memory via MCP, hosted or self-hosted**  
   Engram Vault Sync, listed on the Obsidian community plugins site, syncs an Obsidian vault across devices and exposes it to Claude, Cursor, and ChatGPT over MCP, so AI apps can read notes for context and write new notes back. It adds a REST + WebSocket API over every note, semantic search, and agent chat; it is source-available and Docker-ready for self-hosting, 'free to start' with paid tiers that raise storage/search limits, and claims notes 'travel only to the Engram server you point at' and are not sold, analyzed, or used for model training. A direct competitor in the personal-context-vault-for-AI-chats space.
  - [Engram Vault Sync](https://community.obsidian.md/plugins/engram-vault-sync) (community.obsidian.md) — "Your notes are your AI's memory. Sync your vault everywhere, search by meaning, and let Claude, Cursor, and other AI apps read and write your notes. Hosted or self-host, free to start."

3. **Analysis: platform memory features (ChatGPT, Claude, Gemini, NotebookLM) converging on managed profiles + opt-in connectors, 'eating the consumer case'**  
   A field guide ('The State of Memory') argues AI memory systems are converging fast on conversational recall, and that the built-in platform features - ChatGPT memory + apps-sync, Claude memory/Projects/API tool, Gemini, NotebookLM - are 'converging on managed profile + opt-in connectors - which eats the consumer case.' It frames the remaining opportunity for standalone memory layers as work context (decisions, risks, open questions, ownership) that current memory systems don't hold as first-class objects. This is a significant market claim about platform features that could replace standalone consumer context products like EZ Wallet.
  - [The State of Memory — Why AI Remembers Conversations but Forgets Your Work · Career Hacker Alex](https://www.careerhackeralex.com/sharings/state-of-memory) (www.careerhackeralex.com) — "ChatGPT memory + apps-sync · Claude memory / Projects / API tool · Gemini · NotebookLM. The baseline a standalone layer competes against. Converging on managed profile + opt-in connectors — which eats the consumer case."

4. **ML Digest comparison positions Mem0, Zep, Letta, Supermemory, LangMem and Graphiti in the agent-memory market**  
   A Sep 13, 2026 ML Digest comparison of agent memory systems frames the market: Mem0 for semantic facts and lightweight agent memory; Zep's managed 'Temporal Context Graph' for validity-aware context; Letta's git-backed Markdown memory files where the agent edits its own durable context; Supermemory for unified multimodal context ingestion with hosted and self-hosted paths (self-hosted edition provides Memory API, file ingestion, hybrid search but not hosted connectors or Supermemory MCP); and LangMem for semantic profiles, episodic examples and procedural instructions. It also flags risks of weak memory layers: stale data, cross-tenant context leaks, and prompt-injection via retrieved text.
  - [Which Agent Memory System Should You Choose? Mem0 vs. LangMem, Zep, and Graphiti - ML Digest](https://ml-digest.com/which-agent-memory-system-should-you-choose-mem0-langmem-zep-letta-graphiti-supermemory-qdrant/) (ml-digest.com) — "Prefer Supermemory when unified, multimodal context ingestion is the requirement; it offers hosted use as well as a self-hosting path. The self-hosted edition provides the Memory API, file ingestion, and hybrid search, but it uses your chosen model and does not include the hosted connectors or Super"

5. **MemoryLake's 2026 landscape roundup names Supermemory 'context cloud', Cognee graph memory, and Squish coding-agent memory runtime**  
   A Sep 9, 2026 MemoryLake blog post ('12 Best AI Tools That Remember Long-Term Projects in 2026') maps the competitive field: Supermemory as 'the context cloud for agents, bundling memory, RAG, user profiles, connectors and extractors'; Cognee as 'an open source memory platform for agents that captures context, turns it into graph memory and recalls it across sessions'; Squish from 4mlabs.io as 'a memory runtime for coding agents that stores durable memory for Claude Code, Cursor, Codex and MCP agents'; and Memos as a privacy-first open-source note hub used as a private long-term memory vault for custom assistants. Useful signal on how the memory-vault category is being segmented.
  - [12 Best AI Tools That Remember Long-Term Projects in 2026 | MemoryLake](https://www.memorylake.ai/en/blogs/best-ai-tools-that-remember-long-term-projects) (www.memorylake.ai) — "The Squish homepage from 4mlabs.io: a memory runtime for coding agents that stores durable memory for Claude Code, Cursor, Codex and MCP agents"


## Still in top K

_Nothing carried over from the last run._

## Dropped

_Nothing dropped._

## Articles this run

fetched 6 · skipped as already seen 0 · rejected by guardrail 0 · failed 0

- `fetched` https://ml-digest.com/which-agent-memory-system-should-you-choose-mem0-langmem-zep-letta-graphiti-supermemory-qdrant
- `fetched` https://www.memorylake.ai/en/blogs/best-ai-tools-that-remember-long-term-projects
- `fetched` https://www.careerhackeralex.com/sharings/state-of-memory
- `fetched` https://www.llmnesia.com/privacy-policy
- `fetched` https://community.obsidian.md/plugins/engram-vault-sync
- `fetched` https://www.contextstudios.ai/guides
