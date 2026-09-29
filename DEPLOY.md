# Deploying EZ Wallet on free tiers

| Piece | Service | Free-tier notes |
|---|---|---|
| Frontend (Next.js) | **Vercel** (Hobby) | Always on. Proxies `/api/*` to the backend |
| Backend (FastAPI) | **Render** (Free web service) | **Sleeps after ~15 min idle**; the first request after that takes ~30–60 s while it wakes. The UI retries automatically and says so |
| Database (PostgreSQL) | **Neon** (Free) | 0.5 GB storage; suspends when idle and resumes in about a second |

```
Browser ──HTTPS──► Vercel (Next.js)  ──/api/* rewrite──►  Render (FastAPI)  ──TLS──►  Neon (Postgres)
                   ezwallet.vercel.app                    ezwallet-api.onrender.com
```

The browser only ever talks to the Vercel domain. The session cookie is set there as a first-party `HttpOnly; Secure; SameSite=Lax` cookie, and the Render URL is never exposed to scripts.

Total time: about 20 minutes. You'll need a GitHub account (the repo is already there) and will sign up for Neon, Render and Vercel. All three let you sign in with GitHub, and none needs a credit card.

---

## Step 1: Create the database (Neon)

1. Sign up at **https://neon.tech** and click **Create project**.
   - **Name:** `ezwallet`. **Postgres version:** the default (16 or 17 both work).
   - **Region:** **AWS US West 2 (Oregon)**, which is the same region as the Render service in `render.yaml`.
2. On the project dashboard, click **Connect**, and:
   - **turn Connection pooling OFF**, so you get the *direct* connection string (the app keeps its own small pool);
   - copy the string. It looks like
     `postgresql://neondb_owner:••••@ep-cool-name-123456.us-west-2.aws.neon.tech/neondb?sslmode=require`
3. Keep it somewhere safe for Step 3. **It contains the database password.**

You don't need to create any tables. The backend runs the Alembic migrations automatically the first time it starts.

## Step 2: Generate the vault encryption key (on your computer)

```bash
cd backend
source .venv/bin/activate
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output (44 characters, ending in `=`).

> ⚠️ **Store this key in a password manager.** It encrypts every wallet card. If it's lost or changed, existing card contents can't be decrypted. Use a *new* key for production rather than your local one.

## Step 3: Deploy the backend (Render)

1. Sign up at **https://render.com** with GitHub, and allow it to access the `ezwallet` repo.
2. Click **New → Blueprint** and pick the repo. Render reads `render.yaml` and proposes a web service named **`ezwallet-api`** on the **Free** plan.
3. Fill in the values it asks for:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from Step 1 |
   | `WALLET_ENCRYPTION_KEY` | the key from Step 2 |
   | `GEMINI_API_KEY` | your key from https://aistudio.google.com/apikey (leave empty to disable the LLM proxy) |
   | `GOOGLE_CLIENT_ID` | your OAuth Client ID (leave empty to disable Google sign-in) |
   | `CORS_ORIGINS` | put `https://example.com` for now; you'll set the real Vercel URL in Step 5 |

   `JWT_SECRET` is generated automatically. `COOKIE_SECURE=true` and the other settings are already in the blueprint.
4. Click **Apply** and wait for the deploy to show **Live**. The first build takes 3–5 minutes.
5. Copy the service URL from the top of the page, e.g. `https://ezwallet-api.onrender.com`. It may have a suffix if the name was taken. Check it in a browser:
   `https://ezwallet-api.onrender.com/api/v1/health` should return `{"status":"ok"}`.
   The **Logs** tab should show `Running upgrade -> 0001` and `0001 -> 0002`.

## Step 4: Deploy the frontend (Vercel)

1. Sign up at **https://vercel.com** with GitHub, then **Add New → Project** and import the `ezwallet` repo.
2. Set **Root Directory** to **`frontend`**. Click *Edit* next to it. The framework is detected as **Next.js**; leave the build settings at their defaults.
3. Open **Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `BACKEND_URL` | your Render URL from Step 3, e.g. `https://ezwallet-api.onrender.com` (no trailing `/api`) |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | the same Client ID as on Render (optional) |

4. Click **Deploy**. When it finishes, copy your production URL, e.g. `https://ezwallet-abc.vercel.app`.

> Both variables are read **at build time**. If you change them later, go to **Deployments → ⋯ → Redeploy**. If `BACKEND_URL` is missing, the build stops with a clear error instead of shipping a broken site.

## Step 5: Connect the pieces

1. **Render → ezwallet-api → Environment:** set `CORS_ORIGINS` to your Vercel URL (e.g. `https://ezwallet-abc.vercel.app`) and save. Render redeploys automatically.
2. **Google sign-in** (only if you set a Client ID): in Google Cloud → **Google Auth Platform → Clients → your client → Authorized JavaScript origins**, add your Vercel URL (`https://ezwallet-abc.vercel.app`, no trailing slash) and save. Keep the `localhost` entries for local development. If the app is still in **Testing**, only the **Test users** listed under **Audience** can sign in. New origins can take 5–10 minutes to start working.

## Step 6: Try it

Open your Vercel URL and register. If the backend was asleep, the first page load takes up to a minute, and the app retries on its own. Then unlock the vault, hover a card, and send a prompt.

**Checking persistence:** in Render, click **Manual Deploy → Restart service**, then log in again. Your account and cards are still there, because they live in Neon, not on the Render server.

---

## Updating the live site

Push to `main`. Render and Vercel both redeploy automatically, and new Alembic migrations run on the backend's next start.

## Where things live in production

| What | Where |
|---|---|
| Users, encrypted wallet cards, chat metadata | **Neon PostgreSQL**, reached over TLS (`sslmode=require`) |
| `JWT_SECRET`, `WALLET_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `DATABASE_URL` | **Render environment variables**, never in git |
| `BACKEND_URL`, public Google Client ID | **Vercel environment variables** |
| Prompts, replies, the in-progress conversation | **Nowhere.** Only in the user's browser tab and in transit (zero data retention) |

To look at the production data, open the Neon console → **Tables** or **SQL Editor**, e.g. `select email, left(password_hash, 20) from users;`. You'll see argon2id hashes and Fernet ciphertext, never plaintext.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The server is waking up (free hosting)…" | Normal after the service has been idle. Wait a few seconds and retry |
| Vercel build fails with `BACKEND_URL is not set` | Add it under Settings → Environment Variables, then redeploy |
| Every API call fails with 404 / "Not Found" | `BACKEND_URL` has a typo or ends in `/api`. It must be just the Render origin |
| Render logs show `Missing JWT_SECRET, WALLET_ENCRYPTION_KEY` | An env var is missing on Render. Set both in Render → Environment (don't rely on first-run generation there: Render's disk is wiped on every deploy) |
| Render logs show `Fernet key must be 32 url-safe base64-encoded bytes` | `WALLET_ENCRYPTION_KEY` was pasted incompletely. Regenerate it with Step 2 |
| Render logs show a `connection … SSL` / `password authentication failed` error | Re-copy the Neon string. It must include `?sslmode=require`, and use the direct (not pooled) host |
| Logged in, but get bounced back to /login | Make sure you're using the Vercel URL, not the Render URL. The cookie belongs to the Vercel domain |
| Google popup says `origin_mismatch` | Add the exact Vercel URL to Authorized JavaScript origins (Step 5.2), then wait a few minutes |
| Google button says "(not configured)" | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is missing on Vercel, or the site wasn't redeployed after adding it |

## Free-tier limits worth knowing

- **Render Free:** the service sleeps when idle and has monthly instance-hour limits. Fine for a demo or assignment. For always-on hosting, upgrade the instance type.
- **Neon Free:** a storage cap and a compute-hours allowance per month. This app's tables are tiny.
- **Vercel Hobby:** for personal, non-commercial use.
