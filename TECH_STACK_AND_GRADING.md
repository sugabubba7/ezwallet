# EZ Wallet: Tech Stack & Grading Map

Maps each item of the **Assignment 1** grading table to where it's met and how to check it yourself.
Repo: https://github.com/sugabubba7/ezwallet · Run instructions: [README.md](README.md)

---

## 1. Tech stack (and why)

| Layer | Choice | Why / trade-off |
|---|---|---|
| **Database** | **PostgreSQL on Neon** (SQLite for fully offline use) | The data is relational: users own wallet cards and chats, and deleting a user must cascade. SQL gives unique constraints and foreign keys; I traded Mongo's schema flexibility for those guarantees. Neon is serverless Postgres with a free tier |
| **Migrations** | **Alembic**, run automatically on startup | The schema is versioned (0001 → 0003), and graders never run a migrate command |
| **Backend** | **Python + FastAPI**, SQLAlchemy 2 | Fast to write, with request validation (Pydantic) and interactive docs at `/docs` built in |
| **Auth** | **Written myself** (the recommended option) | **argon2id** password hashing (passlib + argon2-cffi), **JWT** bearer tokens (PyJWT), an HttpOnly cookie for the browser, optional Google sign-in (verified server-side) |
| **Frontend** | **Next.js 15** (React 19, TypeScript), **Tailwind**, Framer Motion, Lucide icons | Lets me build a polished UI quickly. Next.js also forwards `/api/*` to the backend, so the browser sees one origin |
| **Extras** | Fernet-encrypted wallet cards, PIN-locked vault, Gemini proxy with zero data retention | The actual product: a private vault for the context I share with LLMs |
| **Hosting (optional)** | Vercel + Render + Neon (free tiers) | See [DEPLOY.md](DEPLOY.md). The assignment only requires running locally |

```
Browser ──► Next.js :3000 ──(/api/* forwarded)──► FastAPI :8000 ──► PostgreSQL (Neon) / SQLite
```

---

## 2. Grading table

### Frontend locally reachable; register and log in through it: **10**
| | |
|---|---|
| Where | `frontend/`, `npm run dev` → **http://localhost:3000** |
| Screens | **Register** (`/register`), **Log in** (`/login`, accepts email *or* username), **Home** (`/dashboard`, shows who you're logged in as), **Account** (`/account`: change email, password or PIN, delete the account), plus log out (top-right icon) |
| Check | Register a new account, log out, and log back in. Or log in as `NYUgrader` / `Courant2026!` |

### Proper API: endpoints, shapes and status codes: **25**
Every endpoint in the assignment's table exists at **exactly** that path:

| Method | Path | Result |
|---|---|---|
| GET | `/healthz` | 200 `{"status":"ok"}` |
| POST | `/api/auth/register` | 201 `{token, access_token, token_type, user}` · 400 · 409 |
| POST | `/api/auth/login` | 200 `{token, …, user}` · 400 · 401 |
| GET | `/api/auth/me` | 200 `user` · 401 |
| GET | `/api/users/:id` | 200 `user` · 401 · 404 |
| PATCH | `/api/users/:id` | 200 `user` · 400 · 401 · 404 · 409 |
| DELETE | `/api/users/:id` | 200 `{"message"}` · 401 · 404 |

**The three rules:**
1. **Never return a password hash.** No response model has a hash field, and validation errors never echo input values. `tests/test_rubric.py` checks *every* response for hash or password text.
2. **No, bad or expired token → 401.** Tested cases: no header, garbage, empty bearer, the wrong scheme, expired, wrong signature, the wrong token type, and a deleted user's token.
3. **Someone else's `:id` → 404** for GET, PATCH and DELETE alike.
   - **Why 404:** a 403 would confirm the account exists and let a token holder enumerate users. 404 looks identical for "not yours", "doesn't exist" and "not a number".
   - **Order of checks:** ownership is checked before the body is read, so a malformed PATCH at someone else's id is still a 404.
   - **Header wins over cookie:** if an `Authorization` header is present, it's the only credential used. Without that, a script holding two accounts' cookies could be authenticated as the wrong account.

**Check:** `cd backend && pytest -q tests/test_rubric.py`. It replays the grading script: one client, two accounts, every endpoint, all three rules. The whole suite is **46 tests**, passing on SQLite and PostgreSQL 16.

### Data survives a service restart: **5**
| | |
|---|---|
| How | All data lives in the database (Neon Postgres, or SQLite `backend/wallet.db`), never in memory. The signing and encryption keys persist in `backend/.env.local`, so sessions and encrypted cards stay valid across restarts |
| Check | Register, stop the backend (Ctrl+C), start it again, and log in. Everything is still there |

### Passwords hashed with argon2id; no secrets in the repo: **15**
| | |
|---|---|
| Hashing | `backend/app/security.py`: `CryptContext(schemes=["argon2"], argon2__type="ID")`. Stored hashes start with `$argon2id$`. The vault PIN is argon2id-hashed too. Unknown-user logins still spend the same hashing time, so response time doesn't reveal which accounts exist |
| What's committed | `backend/.env`, containing **only** the throwaway grading database (the brief's one allowed exception), the course's published grading login, and non-secret settings |
| What's never committed | `JWT_SECRET` and `WALLET_ENCRYPTION_KEY`. They're generated on first run into the git-ignored `backend/.env.local`. Personal Gemini and Google keys also stay in `.env.local` |
| Check | Run `git grep -nE "AIza[0-9A-Za-z_-]{20}\|WALLET_ENCRYPTION_KEY=[A-Za-z0-9]"`. It finds nothing |

### README.md: **10**
[README.md](README.md) follows the brief's structure:
1. **What it is:** two sentences.
2. **Prerequisites:** Python 3.11+, Node 20+.
3. **Exact commands** for backend and frontend, macOS/Linux and Windows.
4. **Environment:** `.env.example` plus the committed working `.env`.
5. **Anything weird:** start the backend first, automatic migrations and seeding, the generated `.env.local`, port conflicts.

It also covers the API reference and the Rule 3 reasoning, and it was verified by following it on a fresh clone.

### Frontend looks nice: **10**
- A liquid-glass, orange-and-black design with a single typeface.
- The **leather card wallet**: cards slide out after the PIN, and hovering reveals a card's text.
- A **3D cover-flow** chat archive showing the date, time and number of texts exchanged.
- A "Search or Ask" Gemini console.
- Screenshots are in `docs/screenshots/`.

### Assignment Journal Report: **25**
[JOURNAL.md](JOURNAL.md) is the half-page journal. It covers my thought process, the stack and its trade-offs, the challenges I hit (a port conflict, virtualenvs, Google OAuth origins, cold starts), CORS and SameSite, the **404 decision**, and what I enjoyed and learned.
Longer version: [docs/ENGINEERING_NOTES.md](docs/ENGINEERING_NOTES.md). Plain-English explainer: [docs/EZ_Wallet_Explained.docx](docs/EZ_Wallet_Explained.docx).

---

## 3. Before-submission checklist (the grader's own list)
- [x] Bring up the backend and frontend using only README commands, on a fresh clone
- [x] Register, log in, see the home screen, edit the account, log out
- [x] A script registers two accounts and hits every endpoint; shapes and codes are right (`tests/test_rubric.py`)
- [x] Rule 3: A's token at B's `:id` → 404 for GET, PATCH and DELETE
- [x] Restart everything; the data survives
- [x] Auth code uses argon2id; no live credentials in the repo
- [x] Journal written
