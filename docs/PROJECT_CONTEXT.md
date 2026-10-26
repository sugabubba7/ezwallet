# EZ Wallet: project context

The longer story behind `CLAUDE.md`: what has been built, what went wrong, what the research says, and what comes next. Last updated 2026-10-26.

## 1. The problem

- **AI tools are silos.** ChatGPT doesn't know what you told Claude, and Cursor doesn't know what you worked out in Gemini. Every switch means copy-pasting code, errors and earlier decisions, and something always gets lost.
- **Personal data is scattered.** Each AI's memory keeps its own picture of you, and most people don't know what is stored or how to delete it.
- **People paste sensitive things without thinking**: API keys, `.env` files, client code, addresses.

## 2. The product vision

| Feature | Status |
|---|---|
| Encrypted, PIN-locked vault of context cards | **Built** |
| Send a prompt to an AI with a chosen card attached, with zero retention | **Built** (Gemini) |
| Chat summaries: date/time and how many messages were exchanged | **Built** (for chats made in EZ Wallet, plus sample data) |
| Import chats from other AIs | Planned: Gemini Takeout import first |
| Live tracking of AI usage across sites | Planned: browser extension |
| Warning before personal data is sent | Planned: extension, runs on the device |
| Museum of Failures (problem → what fixed it) | Planned: "fix" cards plus "Have I seen this before?" |
| Pull data out of an AI's memory and delete it at the source | Later; mostly manual today (no public delete APIs) |
| Switching models mid-conversation without losing context | Possible later (direct provider APIs, or OpenRouter for prototyping) |

## 3. What the website does today

- Register with an email or username, a password and a 4-digit PIN; log in; Google sign-in (only for test users while the Google app is in Testing).
- Vault: add, edit and delete cards, encrypted at rest. Unlock with the PIN; 5 wrong tries lock it (429).
- Ask Gemini: multi-turn chat with an optional card attached. Only metadata is saved.
- Dashboard: a cover-flow carousel of chat summaries.
- Account: change email or password, delete the account.
- Tracker page: competitor reports (visible when logged in as NYUgrader).

**What it doesn't do yet:** connect to ChatGPT, Claude or the Gemini app, or import their history. The carousel shows seeded sample chats and chats made inside EZ Wallet.

**Known weak spots:** the free Render backend sleeps, so the first load takes 30–60 s. The look needs a polish pass after several quick restyles, and the sample data makes it feel like a demo.

## 4. How conversations work with zero retention

1. The browser tab keeps the running chat in memory (`thread` state in `LlmConsole.tsx`).
2. Each turn it sends the full `history` plus the new prompt to `POST /api/v1/llm/execute`.
3. The backend forwards it to Gemini, returns the reply, and stores only the title, tags, timestamps and `message_count`.
4. If the tab is closed or refreshed, the conversation is gone.

**Caveat:** "zero retention" covers our server. Google's own policy applies on its side. The free Gemini API tier may use prompts to improve Google's products; the paid tier doesn't train on them but may keep short-lived abuse logs. A real launch needs the paid tier or a provider with a no-retention agreement.

**Ways to keep chats without breaking the promise:** browser-only storage; end-to-end encryption with a key derived from the PIN; or a short, user-approved summary only. The last one is what the Museum of Failures uses.

## 5. The plan

### 5a. Gemini import (first real data)

Google offers no "read my Gemini chats" API for outside apps. The Gemini API is separate from the Gemini app. The routes are:

1. **Google Takeout** (start here): My Activity → Gemini Apps, as JSON, from a **dummy account** with Gemini Apps Activity turned on. Upload it to EZ Wallet, group turns into conversations by time gaps, and store metadata only by default.
2. **The browser extension**, for live sync later.
3. **Google Data Portability API**: official OAuth, but region-limited (mainly EU/UK), needs Google's verification, and Gemini support isn't confirmed.

Before writing the parser, get the real file and folder names and one or two sample entries from the dummy export. Never use exports from a real account.

### 5b. Browser extension (the main next build)

- Chrome Manifest V3 (works in Edge, Brave and Arc too), TypeScript, a small React popup, logging in with the existing account and Bearer tokens.
- Version 1: **one site (ChatGPT or Gemini) and two features**:
  1. a personal-data warning before sending;
  2. a "Save this fix" button that writes an encrypted fix card to the backend.
- Risks:
  - "monitoring" sounds like spyware, so do checks on the device, never send raw chats, show what's recorded and allow pausing;
  - site redesigns break the page-reading code;
  - Chrome Web Store review needs a privacy policy and a justification for each permission;
  - stay on the side of users handling their own data (terms of service).
- Test plan: install it on a few friends' and family members' browsers for a week, then interview them.

### 5c. Museum of Failures card

Fields: **problem**, **context** (stack, setup), **what I tried that failed**, **what fixed it**, **why it worked**, **tags**, **which AI was used**. The AI drafts the entry from the chat, and the user edits and saves it. Later, "Have I seen this before?" suggests a matching past fix when a new problem is typed.

## 6. User research

- **Insight so far (vibe coder interview):** people who use AI heavily to learn want a record of their mistakes and exactly what got them out of each one, so the next similar problem is fast. One interview is a lead, not proof.
- **Next interviews (5–10 people):**
  - the last time they hit a problem they'd already solved;
  - whether they keep any record of fixes (ask them to show it);
  - whether they'd write entries themselves or it must happen automatically;
  - whether it's code errors only, or learning mistakes too;
  - what they paste into AIs, and whether they know what AI memory stores.
- **Possible customers:**
  - companies rolling out AI (data-loss prevention);
  - regulated professionals (lawyers, doctors, therapists, accountants);
  - agencies and consultants;
  - developers;
  - schools;
  - AI power users and privacy-conscious individuals.
- **Competitors to watch:**
  - AI memory tools: Mem0/OpenMemory, Letta, Zep, Supermemory, Pieces, Limitless, Personal.ai and Kin;
  - built-in memory in ChatGPT, Claude and Gemini;
  - note apps such as Notion and Obsidian;
  - Cursor rules files.
  - **Our edge:** works across every AI, private by design, and built around problem → fix.

## 7. Course history (CSCI-GA.2630)

- **Assignment 1 (the web app)** was submitted with:
  - the README in the brief's format, plus `JOURNAL.md`;
  - `docs/EZ_Wallet_Explained.docx` and `TECH_STACK_AND_GRADING.md`;
  - a grader-simulation test suite (`backend/tests/test_rubric.py`).
  Problems found and fixed before submission:
  - the cookie used to override the Bearer token;
  - some routes returned 405 instead of 404;
  - `/api/users/:id` was missing.
- **Assignment 1B (the tracker)**: see `AGENT.md` and README section 8.
  - Run 1 completed.
  - Run 2 struggled:
    - the free qwen model was withdrawn from OpenRouter, so it switched to Nemotron;
    - the step budget ran out;
    - the reasoning model hit its output-token limit (`max_output_tokens` raised to 8000);
    - the report JSON came back in the wrong shape, now coerced in `tracker/finish.py`.
  - The committed `reports/run2.md` is labelled PARTIAL.
  - **Lesson:** the validation around the model mattered more than the model itself.
- **Professor updates sent:**
  - the overall progress update;
  - a short note on the extension-first pivot to test with friends and family, promising a fuller email later.

## 8. Hosting

Vercel (frontend) → Render (`ezwallet-api`, free) → Neon Postgres. See `DEPLOY.md`.

- **Secrets:** they live in Render and Vercel environment variables.
- **Session cookie:** first-party, set on the Vercel domain; HttpOnly, Secure, SameSite=Lax.
