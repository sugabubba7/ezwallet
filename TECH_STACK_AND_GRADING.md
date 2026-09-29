# EZ Wallet: Tech Stack & Grading Rubric Map

**Live site:** _add your Vercel URL after deploying_ · **Repo:** https://github.com/sugabubba7/ezwallet

EZ Wallet is a secure "LLM Data Wallet". Users keep sensitive context in an encrypted, PIN-locked vault of cards, attach a card to a prompt only when needed, and send it through a zero-data-retention (ZDR) proxy to Google Gemini. A cover-flow archive shows past sessions using metadata only: date, time and number of texts exchanged.

---

## 1. Tech stack

### Frontend
| Technology | Used for |
|---|---|
| **Next.js 15** (React 19, App Router) | Pages: `/login`, `/register`, `/dashboard`, `/account` |
| **TypeScript** | Type-safe components and API client |
| **Tailwind CSS** | Styling: one font (Inter), orange + black palette, liquid-glass surfaces |
| **Framer Motion** | Wallet cards sliding out, cover-flow carousel, modals |
| **Lucide React** | Icons |
| **Google Identity Services** | "Sign up / Log in with Google" button |

### Backend
| Technology | Used for |
|---|---|
| **FastAPI** (Python) + **Uvicorn** | REST API under `/api/v1` |
| **Pydantic v2** | Request/response validation (JSON shapes) |
| **SQLAlchemy 2** | ORM for the database |
| **Alembic** | Database migrations (run automatically on startup) |
| **passlib + argon2-cffi** | **argon2id** hashing of passwords and PINs |
| **cryptography (Fernet)** | Encrypting wallet-card contents at rest (AES-128-CBC + HMAC-SHA256) |
| **PyJWT** | Session and vault tokens in HTTP-only cookies |
| **google-auth** | Verifying Google sign-in ID tokens on the server |
| **httpx** | Calling the Gemini REST API |
| **pytest** | 32 automated API tests |

### Database
| Environment | Database |
|---|---|
| Local | **SQLite** file `backend/wallet.db` |
| Production | **PostgreSQL** on **Neon** (same code; only `DATABASE_URL` changes) |

Tables: `users`, `wallet_cards`, `chat_summaries` (+ `alembic_version`).

### Hosting (free tier)
| Piece | Service |
|---|---|
| Frontend | **Vercel** |
| Backend API | **Render** |
| Database | **Neon** PostgreSQL |

### How it fits together
```
Browser ──► Next.js (Vercel) ──/api/* proxy──► FastAPI (Render) ──► PostgreSQL (Neon)
                                                      │
                                                      └──► Gemini API (generativelanguage.googleapis.com)
```
The browser only talks to the Next.js site. Next.js forwards `/api/*` to FastAPI server-side, so the login cookie stays first-party and HTTP-only.

---

## 2. Grading rubric map

### ✅ [10 pts] Frontend on `localhost:3000` with working Register & Login
| Requirement | Where it's met |
|---|---|
| Runs on port 3000 | `frontend/package.json` → `"dev": "next dev -p 3000"` |
| Register (email, password, 4-digit PIN) | `frontend/src/app/register/page.tsx`, `components/AuthForms.tsx` |
| Login (email, password) | `frontend/src/app/login/page.tsx` |
| Google sign-up / log-in button | `components/GoogleButton.tsx` → `POST /api/v1/auth/google` |

**How to verify:** `cd frontend && npm run dev`, open http://localhost:3000, create an account, log out, and log back in.

### ✅ [25 pts] REST API: endpoints, JSON shapes, status codes
All endpoints take and return JSON. Errors always come back as `{"detail": "..."}`.

| Endpoint | Success | Errors |
|---|---|---|
| `POST /api/v1/auth/register` | **201** | **400** (bad input / email taken) |
| `POST /api/v1/auth/login` | **200** | **400**, **401** (wrong credentials) |
| `POST /api/v1/auth/google` | **201** new / **200** existing | **400**, **401** |
| `GET /api/v1/auth/me` | **200** | **401** |
| `PUT /api/v1/account/email` | **200** | **400**, **401** |
| `PUT /api/v1/account/password` | **200** | **400**, **401** |
| `PUT /api/v1/account/pin` | **200** | **400**, **401** |
| `DELETE /api/v1/account` | **200** | **400**, **401** |
| `GET /api/v1/wallet/cards` | **200** | **401** |
| `POST /api/v1/wallet/unlock` | **200** | **400**, **401**, 429 (too many PIN tries) |
| `POST /api/v1/wallet/cards` | **201** | **400**, **401** |
| `PUT` / `DELETE /api/v1/wallet/cards/{id}` | **200** | **400**, **401**, **404** |
| `GET` / `DELETE /api/v1/chats/{id}` | **200** | **401**, **404** |
| `POST /api/v1/llm/execute` | **200** | **400**, **401**, **404**, 502, 503 |

- Validation errors are returned as **400** instead of FastAPI's default 422 (`backend/app/main.py`).
- Another user's card or chat returns **404**, so resource IDs can't be probed.
- Full reference: README §4. Interactive docs: http://localhost:8000/docs.
- **Tests:** `backend/tests/test_api.py` checks every status code above.

### ✅ [5 pts] Data persistence across restarts
| Requirement | Where it's met |
|---|---|
| File-backed / real database | SQLite file `backend/wallet.db` locally, PostgreSQL (Neon) in production |
| Schema managed by migrations | `backend/alembic/versions/0001_…`, `0002_…`, applied automatically on startup |
| Survives restarts | Stop the backend (Ctrl+C), start it again, log in, and all data is still there. On the live site, restart the Render service, and the data stays in Neon |

### ✅ [15 pts] Security: argon2id/bcrypt hashing, no hardcoded secrets
| Requirement | Where it's met |
|---|---|
| Passwords hashed with **argon2id** | `backend/app/security.py` → `CryptContext(schemes=["argon2"], argon2__type="ID")`. Stored hashes start with `$argon2id$` |
| PINs hashed too | Same argon2id hashing |
| **Zero hardcoded secrets** | All secrets come from `.env` (`backend/app/config.py`). Secrets have **no defaults**, so the app refuses to start without them. `.env` files are git-ignored; only `.env.example` templates are committed |
| Extra security layers | Wallet cards **encrypted at rest** (Fernet); **HTTP-only, SameSite** session cookies (+ `Secure` in production); a **5-minute vault token** after PIN entry; **PIN lockout** after 5 failures; sessions revoked on password change; Google tokens **verified server-side** (signature, audience, expiry, verified email); Gemini key sent in a header, never the URL |

**How to verify:** `sqlite3 backend/wallet.db "select password_hash from users limit 1;"` shows `$argon2id$…`. Run `git grep -n "JWT_SECRET"`. It finds only the empty template line in `.env.example`, the setup script that *generates* a random secret, the test suite's throwaway placeholder, and the name of the Render setting.

### ✅ [10 pts] README documentation
`README.md` covers:
- §1 **setup** for backend and frontend;
- §3 **architecture** (diagram, repository layout, data model);
- §4 the full REST API;
- §5 **environment variables** (every variable explained);
- §6 **database migrations** (Alembic commands and the migration history);
- §7 security;
- §8 screenshots.

`DEPLOY.md` covers hosting.

### ✅ [10 pts] Polished UI matching the mockups
| Mockup | Implementation |
|---|---|
| Leather card-holder wallet with a red/orange eye button | `components/WalletContainer.tsx`: SVG leather pocket with stitching. Cards are blurred and locked, then **slide up** after the PIN. **Hover reveals** a card's text, and moving away hides it again |
| PIN prompt | `components/PinModal.tsx`: 4-digit input with paste support and a shake on error |
| Cover-flow chat summaries | `components/CoverFlowSlider.tsx`: 3D carousel. Each card shows the **date, time and texts exchanged**. The front card is opaque and back cards progressively blurred |
| Liquid-glass styling | `app/globals.css` (`.liquid-glass`), `components/TopBar.tsx` |

Screenshots are in `docs/screenshots/`.

### ✅ Assignment journal
`JOURNAL.md`: architecture decisions and alternatives, all ten security layers, known limitations, testing, and a reflection section *(fill in your own notes)*.

### ✅ Screen & feature checklist from the brief
| Brief item | Status |
|---|---|
| Screen 1: Register (email, password, PIN, Google) | ✅ |
| Screen 2: Login (email, password, Google) | ✅ |
| Screen 3: Dashboard showing user email + Google/Gemini status | ✅ top bar badges |
| Section A: cover-flow chat summaries (title, model, tags) | ✅ plus date, time and text count |
| Section B: locked wallet → PIN → cards slide up → hover reveal | ✅ |
| Screen 4: change email / password, delete account | ✅ plus change PIN |
| `User`, `WalletCard`, `ChatSummary` models + auto migrations | ✅ `backend/app/models.py`, Alembic |
| `POST /api/v1/llm/execute` Gemini proxy with ZDR | ✅ `backend/app/routers/llm.py`, `backend/app/gemini.py` |

---

## 3. Deviations from the brief (and why)

| Brief said | We did | Reason |
|---|---|---|
| Gemini 1.5 Flash | `gemini-2.5-flash` (configurable) | The 1.5 models are retired |
| Firebase/Google OAuth | Google Identity Services | Only needs a Client ID, no Firebase project; the token is verified by the backend |
| "Memory deleted post-execution" | Buffers are cleared and nothing is stored or logged | Python can't guarantee wiping RAM (best effort). Retention on Google's side depends on your Google project tier (paid tier or Vertex AI for true ZDR) |
| SQLite | SQLite locally **and** PostgreSQL when hosted | Free hosting wipes the server's disk, so production data lives in Neon |

---

## 4. How to run the checks
```bash
cd backend && source .venv/bin/activate && pytest -q   # 32 passed
cd frontend && npm run typecheck && npm run build
```
