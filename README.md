# EZ Wallet

**EZ Wallet is a personal "data wallet" for AI chats.** You keep sensitive context (your writing style, project notes, health info) in a PIN-locked, encrypted vault of cards, attach a card only when a prompt needs it, and send it to Google Gemini through a proxy that stores no prompts or replies.

It's a FastAPI backend with a Next.js frontend, using PostgreSQL (Neon) or SQLite.

---

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| **Python** | **3.11 or newer** (tested on 3.11, 3.12, 3.13) | `python3 --version` |
| **Node.js** | **20 or newer** (comes with npm) | `node --version` |
| **git** | any | `git --version` |

You don't need Docker, a database server, or any API keys. Ports **8000** (backend) and **3000** (frontend) must be free.

---

## 2. Run it

Use **two terminals**. Start the **backend first**.

### Terminal 1: backend (http://localhost:8000)

**macOS / Linux**
```bash
git clone https://github.com/sugabubba7/ezwallet.git
cd ezwallet/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

**Windows (PowerShell)**
```powershell
git clone https://github.com/sugabubba7/ezwallet.git
cd ezwallet\backend
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Wait for `Application startup complete.`, then check it from any other terminal:
```bash
curl http://localhost:8000/healthz
```
It should return `{"status":"ok"}`.

### Terminal 2: frontend (http://localhost:3000)

```bash
cd ezwallet/frontend
npm install
npm run dev
```

Open **http://localhost:3000**. Register a new account, or log in with the grading account:

| Username | Password | Vault PIN |
|---|---|---|
| `NYUgrader` | `Courant2026!` | `2026` |

On the login screen, type the username into the "Email or username" box. The PIN unlocks the wallet cards on the dashboard (click the orange eye).

---

## 3. Environment

| File | In git? | What's in it |
|---|---|---|
| `backend/.env` | ✅ **committed on purpose** | The **working config for grading**: the throwaway database made for this assignment, the course's grading login, and non-secret settings. Nothing in it protects anything real |
| `backend/.env.example` | ✅ | **Every** variable the backend reads, with an explanation of each |
| `backend/.env.local` | ❌ git-ignored | **Created automatically on first run.** Holds the two real secrets (`JWT_SECRET`, `WALLET_ENCRYPTION_KEY`), plus any personal keys you add (Gemini, Google) |
| `frontend/.env.local.example` | ✅ | Optional frontend settings. The frontend needs **no** env file to run locally |

**Which secrets matter, and why they're handled differently:**
- **Database URL:** a throwaway database created only for this assignment, so it's committed as the brief asks.
- **`JWT_SECRET` and `WALLET_ENCRYPTION_KEY`:** real secrets, so they are **never** committed. The backend generates them on first start and saves them to `backend/.env.local`, and later restarts reuse them. There's nothing to copy by hand.
- **Personal API keys (Gemini, Google OAuth):** these are *my* accounts, so they aren't in the repo. The app runs fine without them:
  - **Gemini:** without a key, the "Ask Gemini" box returns a clear 503 message. To enable it, add `GEMINI_API_KEY=...` to `backend/.env.local`.
  - **Google sign-in:** the button shows "(not configured)". To enable it, add `GOOGLE_CLIENT_ID=...` to `backend/.env.local` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...` to `frontend/.env.local`.

Priority order: **real environment variables > `backend/.env.local` > `backend/.env`**.

---

## 4. Anything weird (read this if something fails)

- **Start the backend before the frontend.** The frontend forwards every `/api/*` request to `http://127.0.0.1:8000`.
- **Migrations run automatically** when the backend starts (Alembic `upgrade head`). There's no separate migrate command. You'll see `Running upgrade … -> 0003` the first time.
- **Seeding is automatic, too.** On startup, the `NYUgrader` account is created if it doesn't exist. Every new account gets 3 sample wallet cards and 5 sample chat summaries, so the dashboard isn't empty.
- **First start writes `backend/.env.local`.** Don't delete it: it holds the key that decrypts wallet cards.
- **"Address already in use" / wrong app answering on port 8000:** check `curl http://localhost:8000/healthz`. If the reply isn't exactly `{"status":"ok"}`, another program owns the port. Find it with `lsof -i :8000` (macOS/Linux) and stop it.
- **macOS zsh:** copy commands without trailing `# comments`. By default zsh passes them as arguments.
- **Reset all local data** (only when using SQLite): stop the backend and delete `backend/wallet.db*`.

---

## 5. API

JSON in, JSON out. Protected routes take `Authorization: Bearer <token>`. Every error has the shape `{"detail": "message"}`.

### The assignment's endpoints

| Method | Path | Auth | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/healthz` | no | none | **200** `{"status":"ok"}` | none |
| POST | `/api/auth/register` | no | `{"email"?, "username"?, "password", "pin"?}` (email **or** username required) | **201** `{token, access_token, token_type, user}` | 400 invalid input · 409 email/username taken |
| POST | `/api/auth/login` | no | `{"email" \| "username", "password"}` | **200** `{token, access_token, token_type, user}` | 400 · 401 wrong credentials |
| GET | `/api/auth/me` | yes | none | **200** `user` | 401 |
| GET | `/api/users/:id` | yes | none | **200** `user` | 401 · **404 not yours** |
| PATCH | `/api/users/:id` | yes | any of `{"email", "username", "password", "current_password"}` | **200** `user` | 400 · 401 · **404 not yours** · 409 taken |
| DELETE | `/api/users/:id` | yes | none | **200** `{"message": "User deleted"}` | 401 · **404 not yours** |

The `user` object looks like this. It **never** includes a password or hash:
```json
{"id": 1, "email": "a@example.com", "username": null, "has_password": true,
 "has_pin": false, "google_linked": false, "google_picture": null,
 "created_at": "2026-09-29T12:00:00Z"}
```

### The three rules
1. **No password hashes, ever.** Passwords are stored as argon2id hashes, and no response model has a field for them. Validation errors never echo input values. The test suite checks every response for hash or password text.
2. **Missing, bad, or expired token → 401.** This covers no header, garbage, an expired token, a wrong signature, the wrong token type, and the token of a deleted user. If an `Authorization` header is sent, it's the only credential considered. A bad bearer token is a 401 even when a valid session cookie is also present.
3. **Someone else's `:id` → 404**, the same for GET, PATCH and DELETE.
   - **Why 404 and not 403:** a 403 means "that account exists, you just can't touch it", which lets anyone with a token probe which ids are real. A 404 answers the same way for "not yours", "doesn't exist" and "not even a number", so nothing leaks. OWASP recommends this to prevent account enumeration.
   - **Order of checks:** ownership is checked **before** the request body is read, so a malformed PATCH aimed at another user's id is still a 404, never a 400 that would hint the id is real.

### Try it with curl
```bash
curl -s -X POST localhost:8000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}'
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"
```
Interactive docs for every endpoint are at **http://localhost:8000/docs**.

### Web-app endpoints (used by the frontend)
Everything under `/api/v1/…`:
- `auth/*`: the same handlers as above, plus Google sign-in and logout.
- `account/*`: change email, password or PIN, and delete the account (requires the current password).
- `wallet/*`: encrypted cards and PIN unlock.
- `chats`: metadata-only session history.
- `llm/execute`: the Gemini zero-data-retention proxy.

---

## 6. Checks

**Automated tests** (54 tests: every endpoint, all three rules, and a simulation of the grading script with two accounts):
```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

**Data survives a restart:** register, stop the backend (Ctrl+C), start it again with the same `uvicorn` command, and log in. Your account, cards and chat history are still there, because they live in the database, not in memory.

**Passwords:** hashed with **argon2id** in `backend/app/security.py` (`CryptContext(schemes=["argon2"], argon2__type="ID")`). Stored hashes start with `$argon2id$`.

---

## 7. How it's built

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (React 19, TypeScript), Tailwind CSS, Framer Motion |
| Backend | Python, FastAPI, SQLAlchemy 2, Alembic migrations |
| Database | PostgreSQL on Neon (production and grading), SQLite for fully offline use |
| Auth | Own implementation: argon2id hashing, JWT bearer tokens (plus an HttpOnly cookie for the browser), optional Google sign-in |
| Extras | Fernet-encrypted wallet cards, PIN-gated vault, Gemini proxy that stores metadata only |

```
Browser ──► Next.js :3000 ──(/api/* forwarded)──► FastAPI :8000 ──► PostgreSQL / SQLite
                                                         └──► Gemini API (optional)
```

The frontend forwards `/api/*` to the backend server-side, so the browser only ever talks to one origin. Login cookies stay first-party, and there are no CORS preflights in normal use. The backend also has CORS configured for direct browser clients (`CORS_ORIGINS`).

More detail:
- [TECH_STACK_AND_GRADING.md](TECH_STACK_AND_GRADING.md): how each rubric item is met
- [JOURNAL.md](JOURNAL.md): the journal report
- [DEPLOY.md](DEPLOY.md): optional free hosting on Vercel, Render and Neon
- [docs/EZ_Wallet_Explained.docx](docs/EZ_Wallet_Explained.docx): the whole project explained in plain English

### Repository layout
```
backend/
  app/main.py            app setup, /healthz, router mounting, startup migrations
  app/routers/auth.py    register, login, me (mounted at /api/auth and /api/v1/auth)
  app/routers/users.py   GET/PATCH/DELETE /api/users/:id (Rule 3 lives here)
  app/deps.py            token checking (Rule 2)
  app/security.py        argon2id, JWT, Fernet encryption
  app/config.py          settings loading + first-run secret generation
  app/routers/tracker.py tracker API (assignment 1B)
  alembic/versions/      database migrations 0001–0004
  tests/                 pytest suite (test_rubric.py mirrors the grading script)
  .env                   committed grading config (throwaway DB only)
  .env.example           every variable, documented
tracker/
  agent.py guard.py fetcher.py search.py llm.py ...   the hand-written agent (see section 8)
config.yaml              tracker policy: topic, K, model, limits, allowed hosts
frontend/
  src/app/               pages: login, register, dashboard, account, tracker
  src/components/        wallet, carousel, console, modals
```

---

## 8. Assignment 1B: the agentic competitor tracker

An agent that finds the top **K = 5** developments about **competitors to EZ Wallet** (AI memory vaults, context managers, privacy-first LLM gateways), ranks them, cites a source and a verbatim quote for each, and remembers what it has seen. Run it again and it reports **New since last run → Still in top K → Dropped**. Results appear on the **Competitors** page of this app (behind the normal login).

The agent loop is hand-written ([tracker/agent.py](tracker/agent.py)); there is no agent framework. Policy lives in [config.yaml](config.yaml). [AGENT.md](AGENT.md) answers the design questions.

### Prerequisites
Everything in section 1, plus keys in `tracker/.env.local` (see [tracker/.env.example](tracker/.env.example)):

| Variable | Where to get it |
|---|---|
| `GROQ_API_KEY` (or `GEMINI_API_KEY` / `OPENROUTER_API_KEY`, matching `model.provider` in `config.yaml`) | https://console.groq.com/keys |
| `TAVILY_API_KEY` | https://app.tavily.com |
| `TRACKER_API_URL`, `TRACKER_LOGIN`, `TRACKER_PASSWORD` | the backend the tracker saves to and the account whose page shows the results (`NYUgrader` and its password are in section 2) |

Set a spend cap on any paid key before the first run. Free tiers have **daily** caps as well as per-minute ones; the tracker treats a daily cap as terminal and stops.

### Commands, in order

**1. Bring up the A1 backend and frontend** (two terminals, as in section 2). Or point `TRACKER_API_URL` at the deployed backend and skip the local one.
```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000
```
```bash
cd frontend && npm install && npm run dev
```

**2. One-time tracker setup** (from the repository root)
```bash
python3 -m venv tracker/.venv
tracker/.venv/bin/pip install -r tracker/requirements.txt
cp tracker/.env.example tracker/.env.local
```
Then edit `tracker/.env.local` and fill in the keys.

**3. Run the tracker**
```bash
tracker/.venv/bin/python -m tracker run --report reports/run1.md --trace traces/run1.jsonl
```

**4. Run it again** (at least a day later, so there is something new)
```bash
tracker/.venv/bin/python -m tracker run --report reports/run2.md --trace traces/run2.jsonl
```

**5. Reset its saved state**
```bash
tracker/.venv/bin/python -m tracker reset --yes
```

Exit codes: `0` complete · `1` partial (a budget ran out; the report says why) · `2` terminal failure (bad key, daily quota, payment required) · `3` gave up after retries (network down).

Open **http://localhost:3000/tracker** (or your Vercel URL + `/tracker`) after logging in.

**Run the tools without the model**
```bash
tracker/.venv/bin/python -m tracker.tools search_web "ai memory vault launch"
tracker/.venv/bin/python -m tracker.tools fetch_article https://example.com/
tracker/.venv/bin/python -m tracker.tools fetch_article http://169.254.169.254/   # rejected by the guardrail
tracker/.venv/bin/python -m tracker.tools finish some_report.json
```

**Tests** (no network, no model, no keys needed)
```bash
tracker/.venv/bin/python -m pytest tracker/tests -q        # guardrail, failure handling, budgets, recrawl, injection
cd backend && pytest -q                                    # includes the tracker API tests
```

### Where the agent keeps its memory
Only in the backend, through the API below. The tracker never opens the database. Every endpoint returns **401** without a valid token, and every query is filtered by the caller's `user_id`, so one user cannot read or change another's tracker data (other users' run ids return 404).

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/v1/tracker/state` | yes | none | **200** seen URLs, developments with sources, last top K | 401 |
| DELETE | `/api/v1/tracker/state` | yes | none | **200** `{"message": …}` (forgets everything for this user) | 401 |
| POST | `/api/v1/tracker/runs` | yes | `{topic, k}` | **201** `{id}` | 400 · 401 |
| POST | `/api/v1/tracker/runs/:id/finish` | yes | `{status, partial_reason?, report_md, stats, articles[], developments[]}` | **200** run detail with the new/still/dropped split | 400 · 401 · 404 · 409 already finished |
| PUT | `/api/v1/tracker/runs/:id/report` | yes | `{report_md}` | **200** | 401 · 404 |
| GET | `/api/v1/tracker/runs` | yes | none | **200** run history | 401 |
| GET | `/api/v1/tracker/runs/latest` | yes | none | **200** latest report | 401 · 404 none yet |
| GET | `/api/v1/tracker/runs/:id` | yes | none | **200** report for one run | 401 · 404 |
| GET | `/api/v1/tracker/runs/:id/articles` | yes | none | **200** every article attempt: fetched / skipped / rejected / failed | 401 · 404 |

### Schema (migration `0004_tracker`)
```
tracker_runs          id, user_id→users, started_at, finished_at, status(running|complete|partial|failed),
                      partial_reason, topic, k, report_md, stats(JSON), changes(JSON: new/still/dropped)
tracker_developments  id, user_id→users, title, summary, first_run_id→tracker_runs, created_at, updated_at
tracker_sources       id, development_id→tracker_developments, url, title, quote, run_id        UNIQUE(development_id, url)
tracker_articles      id, user_id→users, run_id→tracker_runs, url, canonical_url, title,
                      status(fetched|skipped|rejected|failed), reason, content_hash, fetched_at
tracker_topk          id, run_id→tracker_runs, development_id→tracker_developments, rank, section(new|still), summary
```
Why this shape: a *development* is one real-world event with **many** supporting URLs (`tracker_sources`), so a new URL about an old event attaches to the existing development instead of creating a duplicate. `tracker_articles` is the URL-level cache (what to skip next time) and the per-run fetch log the page displays. `tracker_topk` is one row per ranked item per run, so "what was the top K last time?" is a query, not a guess.

### Security notes
- `fetch_article` ([tracker/guard.py](tracker/guard.py)) refuses non-http(s) schemes, URLs with credentials, odd ports, and any host that resolves to a loopback, private, link-local, carrier-grade-NAT, multicast or reserved address. It checks every redirect hop and connects to the address it validated, so a hostile DNS answer cannot swap in a private IP. It enforces a per-read timeout, a total timeout and a byte limit, and accepts only text content types.
- Fetched text reaches the model only inside `<untrusted_web_content>` tags, and the closing tag is stripped from page text so it cannot break out. Tools, budgets and URL checks live in the runtime, so no page can change them.
- The Competitors page renders every web-derived string as React text (no `dangerouslySetInnerHTML`, no markdown renderer), and only makes `http(s)` URLs clickable.
