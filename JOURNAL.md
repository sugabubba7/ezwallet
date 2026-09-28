# Assignment Journal: EZ Wallet (LLM Data Wallet)

> Fill in the *[bracketed]* fields with your own notes before submitting. Everything else describes the implementation as built.

**Student:** *[name]* · **Date:** *[date]* · **Repo:** *[link]*

---

## 1. Problem statement

People paste the same sensitive context into LLM chats again and again: their writing style, project details, medical notes. Each paste risks retention by the provider, by the app, and in browser history. The goal was a **wallet** for that context:

- it is stored encrypted and unlocked with a PIN;
- it is shown only on deliberate interaction;
- it is attached to a prompt only when needed and forwarded through a proxy that **retains nothing**;
- it has a browsable history made of metadata only.

## 2. Rubric mapping

| Rubric item | Where it is satisfied |
|---|---|
| Frontend on :3000, Register & Login | `frontend/src/app/{register,login}`, `npm run dev` binds port 3000 |
| REST endpoints, JSON shapes, 200/201/400/401/404 | `backend/app/routers/*`, table in README §4, `tests/test_api.py` asserts every code |
| Persistence across restarts | SQLite file `wallet.db` + Alembic. Verified by restarting the API and logging back in (README §2.4) |
| argon2id hashing, no hardcoded secrets | `app/security.py` (`argon2__type="ID"`), `app/config.py` (required secrets, no defaults), `.gitignore` |
| README | `README.md`: setup, architecture, migrations, env vars |
| Polished UI matching mockups | `WalletContainer.tsx` (mockup 1), `CoverFlowSlider.tsx` (mockup 2) |
| Journal | this file |

## 3. Architecture decisions

| Decision | Alternatives considered | Why this one |
|---|---|---|
| **Next.js rewrite proxy** (`/api/*` → FastAPI) | CORS with the browser calling :8000 directly | The session cookie becomes same-origin and `HttpOnly`, the frontend never touches tokens, and there's no CORS preflight or `SameSite=None` complexity |
| **JWT in HTTP-only cookie, plus Bearer fallback** | localStorage token | JavaScript can't read the cookie, so XSS can't steal it. Bearer support keeps the API usable from curl and Postman |
| **Two-tier auth: session JWT + short-lived vault JWT** | Re-sending the PIN on each call; decrypting on login | The PIN unlocks a 5-minute capability that the server checks on every sensitive call. Closing the tab or waiting re-locks it |
| **Fernet for card content** | SQLCipher; client-side E2E encryption | Authenticated encryption in a few lines, with a key held in env. E2E would stop the server from forwarding context to Gemini, which is the product's core feature |
| **Metadata-only chat summaries** | Storing an LLM-generated summary | A generated summary is derived prompt data, which contradicts ZDR. Title, tags, model, date and time, and the **number of texts exchanged** are enough for the archive. The count is what signals how important a chat was |
| **Client-held transcript for multi-turn** | Storing the conversation server-side | The browser keeps the thread in memory and re-sends it each turn. The server forwards it to Gemini and increments `message_count`. Close the tab and the conversation is gone |
| **Liquid-glass UI, one typeface, orange + black** | The first multi-hue draft | Direction from the design review: a single family (Inter), orange shades and warm blacks only, and Apple-style liquid glass (backdrop blur + saturation, a specular rim drawn with a masked gradient border, an inner sheen) for the header and every section |
| **Alembic run in `lifespan`** | `Base.metadata.create_all()` | Real, versioned migrations that still apply themselves on startup, as the brief requires |
| **Google Identity Services** (ID token) | Firebase Auth | Only a Client ID is needed, with no Firebase project or service account. The backend verifies the token with `google-auth` |
| **Validation errors → 400** | FastAPI's default 422 | The rubric lists 400 for bad input, so a custom `RequestValidationError` handler normalises it |
| **`gemini-2.5-flash` default** (configurable) | Gemini 1.5 Flash, as the brief named | The 1.5 models are retired, so the model is an env var instead |

## 4. Security layers

1. **Credential storage.** Passwords and PINs are hashed with argon2id (memory-hard and salted per hash). Login for an unknown email still runs a dummy hash, so response timing doesn't reveal which emails are registered.
2. **Password policy.** At least 8 characters with at least one letter and one digit, enforced server-side in Pydantic and mirrored in the UI's strength meter.
3. **Session management.** HS256 JWTs carry `typ` (access or vault) and `ver` (`token_version`). A password change bumps `token_version`, which instantly invalidates every other session and vault token. Logout clears both cookies.
4. **Vault gate.** Card content is only returned after `POST /wallet/unlock` succeeds. Five wrong PINs trigger a 5-minute lockout (HTTP 429 with `Retry-After`). The unlock lasts `VAULT_SESSION_MINUTES`, and the UI shows a countdown and auto-locks.
5. **Encryption at rest.** `wallet_cards.content_encrypted` holds Fernet tokens (AES-128-CBC + HMAC-SHA256). A stolen `wallet.db` without the env key exposes no card contents.
6. **Presentation layer.** When locked, the client has no plaintext at all. When unlocked, each card renders a **fixed-length mask** and only puts the real string in the DOM while it is hovered or focused. When the vault locks, the React state holding decrypted cards is dropped.
7. **Authorization.** Every lookup is scoped to the owner. A foreign ID returns 404, so resource IDs can't be enumerated.
8. **ZDR proxy.** The prompt and context are assembled in local variables and sent with `x-goog-api-key`, never `?key=`, which would leak into logs. Payload containers are cleared and `gc.collect()` runs afterwards. The response carries `Cache-Control: no-store`. Only metadata is written to `chat_summaries`.
9. **Transport and headers.** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `COOP: same-origin-allow-popups` (needed for the Google popup). `COOKIE_SECURE=true` for HTTPS deployments.
10. **Secrets hygiene.** Settings fields for secrets have no defaults. `.env*` is git-ignored. `scripts/init_env.py` generates fresh keys locally.

### Known limitations and honest caveats
- Python strings can't be zeroed in place, so the RAM scrub is best effort.
- Provider-side retention depends on the Google project tier and settings (README §7).
- SQLite suits a single-node deployment. Move `DATABASE_URL` to PostgreSQL for production.
- Rotating `WALLET_ENCRYPTION_KEY` needs a re-encryption migration, which could be done with `MultiFernet`.
- There is no email verification for password-based sign-up.

## 5. UI and interaction notes

- **Wallet (mockup 1).** The leather pocket is an SVG path with a scooped mouth, dashed "stitching" inset by 9px, and a subtle feTurbulence grain. Cards are absolutely positioned and animated with Framer Motion springs. When unlocking, they are staggered from the front card to the back so they visibly **slide upward** out of the pocket. A hovered card rises just far enough to clear the pocket's mouth.
- **Cover flow (mockup 2).** Cards use an "energy card" style: an orange-to-deep-red gradient, the chat's time as a large figure, the date beneath it, and a bar plus ring showing texts exchanged relative to your busiest chat. Depth is by distance from the active card. The front card is fully opaque and on top. Neighbours are 50% opaque with a 3.5px blur, and the next ones out are 14% with a 9px blur, so no back-card edge reads through the front. The control bar is a liquid-glass "player".
- **Accessibility.** PIN boxes support paste, arrows and backspace. Cards are focusable, and focus reveals like hover does. The carousel works with arrow keys. Dialogs close on Esc and have ARIA roles.

## 6. Testing

- `backend/tests/` has 32 tests. They cover the Alembic 0001→0002 data migration, every status code, argon2id hash prefixes, Fernet ciphertext at rest, PIN lockout, cross-user 404s, token revocation, cascade delete, and a mocked Gemini transport that asserts the key is sent in a header and the context in the body.
- Manual and E2E: register → unlock → hover reveal → attach → execute → restart API → log in with changed email → data present → delete account → login returns 401.

## 7. Reflection

*[What went well / what was hard / what you'd do next, e.g. passkeys for vault unlock, per-card access audit log, MultiFernet key rotation, streaming responses.]*
