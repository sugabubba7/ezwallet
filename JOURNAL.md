# Assignment 1 Journal: EZ Wallet

I wanted a tool I'd actually use: a "wallet" for the personal context I keep pasting into AI chats. It sits in an encrypted, PIN-locked vault, and I attach a card only when a prompt needs it. Long term, it should pull my data out of every LLM's memory and delete it there.

**Stack and trade-offs.** **FastAPI** because I'm fastest in Python and it gives me validation and docs for free; **Next.js + Tailwind** because I wanted it to look good; **PostgreSQL on Neon** because my data is relational. Users own cards and chats, and deleting a user must cascade, so structured SQL beat Mongo: I traded flexibility for unique emails and foreign keys. Passwords and PINs use **argon2id**, and cards are encrypted at rest.

**What I went through.** Most of the pain wasn't code. A leftover proxy from another project was squatting on port 8000, so my frontend got mysterious 422s from the wrong app. Now I check who's actually answering (`curl /healthz`) first. I also ran uvicorn in the wrong virtualenv, got bitten by zsh treating `# comments` as arguments, and hit Google's `origin_mismatch` until I registered my domain. Render's free tier sleeps, so I added retries and a "waking up" message.

**CORS and cookies.** Vercel and Render are different origins, so a cookie would need `SameSite=None` plus credentialed CORS. Instead, Next.js forwards `/api/*`, so the browser sees one origin and the cookie stays `HttpOnly; SameSite=Lax; Secure`.

**Rule 3: I chose 404.** A 403 admits the account exists, which lets a token holder enumerate users. Testing like the grading script taught me more: my cookie was overriding the Bearer header, so a client holding two accounts' cookies could act as the wrong user. Now the header wins, and ownership is checked before the body is parsed.

**What I enjoyed and learned.** Designing the leather wallet and cover-flow UI was the fun part. The real lesson was that security lives in details like check order, which credential wins, and which secrets are truly secret.
