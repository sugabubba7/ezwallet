# CLAUDE.md

Project memory for Claude Code. Read this first, then `docs/PROJECT_CONTEXT.md` for the full story.

## What EZ Wallet is

A personal **data wallet for AI**. People use many AI tools (ChatGPT, Claude, Gemini, Cursor…) and each one is a silo: you re-explain yourself on every switch, and your personal data piles up in each company's memory. EZ Wallet is the one place that:

1. lists all your AI chats across tools as summaries (date/time, how many messages were exchanged);
2. keeps your personal context in an encrypted, PIN-locked vault and shares only what you pick with whichever AI you use;
3. pulls data out of each AI's memory into the vault and helps delete it at the source;
4. warns you before you send personal data to an AI;
5. keeps a **Museum of Failures**: problems you hit and exactly how you fixed them, so the next similar problem is quick (from user research; see the context doc).

It started as an NYU course project (CSCI-GA.2630, Assignment 1 = the web app, Assignment 1B = the competitor tracker agent). The owner is now taking it further as a product.

## Current direction (2026-10)

- **Extension first.** The website works, but the AI platforms have no API for reading a user's chats, and the site kept getting stuck on permissions and API access. Next build: a Chrome (Manifest V3) extension on chatgpt.com / gemini.google.com / claude.ai that reuses this backend, for testing with friends and family.
- **Gemini import.** First data source: a Google Takeout export (My Activity → Gemini Apps, JSON) from a **dummy** account, uploaded and parsed into chat summaries. Write the parser against a real sample, not a guess.
- **User research.** Interviewing heavy AI users (starting with vibe coders) about switching tools and handling personal data.

## Rules that must hold

- **Zero retention for conversations.** Raw prompts/replies are never stored on the server. The live chat lives only in the browser tab and is re-sent as `history` each turn. The server stores metadata only (title, tags, timestamps, `message_count`).
- **User-saved data is encrypted.** Anything the user deliberately keeps (vault cards, future "fix" entries) is Fernet-encrypted at rest and behind the PIN. Saving is always the user's choice, never automatic.
- **Personal-data checks run on the device** (in the extension), not on the server.
- **Secrets never go in git.** Personal keys go in git-ignored `backend/.env.local` / `tracker/.env.local`. The committed `backend/.env` holds only throwaway local values and the grader account. Never commit Takeout exports or real chat data.
- **API contract (graded, keep it):** never return a password hash; missing/bad/expired token → 401; another user's resource → 404 (GET, PATCH and DELETE alike, checked before the body is parsed); the Bearer header wins over the cookie.

## Stack and layout

| Part | Tech | Hosted on |
|---|---|---|
| `frontend/` | Next.js 15 (App Router), Tailwind, Framer Motion, Lucide; `/api/*` is rewritten to `BACKEND_URL` | Vercel |
| `backend/` | FastAPI, SQLAlchemy 2, Alembic (runs on startup), Pydantic v2, PyJWT, argon2id, Fernet, google-auth, Gemini REST via httpx | Render (free; sleeps when idle) |
| Database | Postgres (SQLite locally) | Neon |
| `tracker/` | Python competitor-tracker agent (OpenRouter/Gemini/Groq/OpenAI + Tavily); policy in root `config.yaml`; see `AGENT.md` | runs locally, saves through the backend |

Key backend files: `app/main.py` (routers, lifespan), `app/deps.py` (auth, ownership helpers), `app/routers/{auth,users,wallet,chats,llm,account,tracker}.py`, `app/seed.py` (demo data and the grader account), `alembic/versions/`.
Key frontend files: `src/lib/api.ts` (fetch wrapper, retries GETs while Render wakes), `src/components/{LlmConsole,CoverFlowSlider,WalletContainer,TopBar}.tsx`, `src/app/globals.css` (liquid-glass styles).
Design: a blend of white, gray and black (no orange), Montserrat only (bold and italic mixed for emphasis), white logo, Apple-style liquid-glass panels.

## Commands

```bash
# backend (http://localhost:8000)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q                              # all backend tests

# frontend (http://localhost:3000); run from frontend/, not backend/
cd frontend && npm install && npm run dev
npm run typecheck && npm run build

# tracker (from the repo root)
tracker/.venv/bin/python -m pytest -q tracker/tests
tracker/.venv/bin/python -m tracker run --report reports/run2.md --trace traces/run2.jsonl
```

Local login: `NYUgrader` / `Courant2026!`, vault PIN `2026` (created on startup).

## Gotchas

- `JWT_SECRET` and `WALLET_ENCRYPTION_KEY` are generated into `backend/.env.local` on first local run. On Render they must be set as env vars, because its disk resets on each deploy. Changing the encryption key makes existing cards unreadable.
- Port 8000 may already be taken on the owner's Mac by another app (`zdr-security-proxy`), which shows up as 422 errors. Use `--port 8001` or stop that app.
- The tracker prints nothing until it finishes; `tail -f traces/run2.jsonl` to watch it.
- Free OpenRouter models get withdrawn and rate-limited. Switching provider is one block in `config.yaml`.

## Open to-dos

- Rotate `WALLET_ENCRYPTION_KEY` on Render (an old one was pasted in a chat).
- `reports/run2.md` on main is labelled PARTIAL (search budget exhausted). Re-run it if a complete run 2 is needed.
- Add the live Vercel URL to the README.
- Build: the Gemini Takeout importer, then the extension (personal-data warning and "Save this fix" first).
