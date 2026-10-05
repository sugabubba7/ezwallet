# AGENT.md: how this tracker actually works

System: [tracker/](tracker/) (about 2,000 lines of Python, no agent framework), policy in [config.yaml](config.yaml), memory in the EZ Wallet backend. Numbers below were measured from traces of this system on 2026-10-04 (development runs against a local backend). Regenerate them for the graded runs with `python -m tracker.trace_stats traces/run1.jsonl`.

## 1. Workflow vs. agent

**The model decides:** which search queries to run, which search results are worth fetching, how to rank the developments, how to word each summary, which quote supports it, and when it has enough to call `finish`. That is the open-ended part, and a fixed workflow could not do it.

**My code decides everything that must be reliable:**

| Decision | Where |
|---|---|
| Which tools exist and that unknown tools are refused | `Agent._dispatch`, `tools:` in config.yaml |
| Step, fetch, search, token, cost and wall-clock budgets, and what a stop looks like | `Agent._stop_reason`, `_force_finish` |
| Whether a URL is fetched at all (seen before? same content hash? guardrail?) | `Agent._tool_fetch`, `tracker/guard.py` |
| What counts as transient vs. terminal, and how long to wait | `tracker/http_errors.py`, `tracker/retry.py` |
| Whether a report is acceptable (every source fetched this run, every quote verbatim in the page, no invented figures) | `tracker/finish.py` |
| Whether two items are the same development | `tracker/finish.py` + `tracker/dedupe.py` |
| New vs. still vs. dropped | the backend, by comparing against the stored last top K |

**One decision I moved out of the model: "have I already read this article?"** My first version only told the model in the prompt not to refetch URLs marked `already_seen`. In live runs it ignored this. Qwen re-requested the same three pages in consecutive steps (the trace shows `already fetched this run (repeat request)` three times in one step), burning steps and tokens. So the runtime now answers a repeat or cached URL itself without a request, records it as `skipped`, tells the model so, and counts a strike; three strikes end the loop and force a report. A second example in the same spirit: when a page exceeded the size limit, `gpt-oss-120b` tried to get around the limit by fetching the same page through the reader proxy `r.jina.ai`. The guardrail allowed it (a public host), so `*.jina.ai`, archive and cache hosts are now in `blocked_hosts`. Anything that has to hold regardless of what the model feels like doing lives in code.

## 2. The network

Trace of a complete development run (`qwen/qwen3.8-27b`, 6 model steps, from `python -m tracker.trace_stats`):

| Service | Round trips | Time | What |
|---|---|---|---|
| Groq (model) | 6 | 10.1 s | one per step |
| Tavily (search) | 4 | 11.3 s | 2 searches in step 1, 2 more in step 2 (4 credits) |
| The open web (`fetch_article`) | 4 | 1.7 s | 3 pages fetched, 1 returned HTTP 404 |
| EZ Wallet backend | 6 | 0.2 s | health, login, load state, start run, save run, attach report |
| **Total** | **20** | **224 s wall clock** | |

**Where the time went:** 201 of the 224 seconds were the agent asleep in backoff, waiting out Groq's free-tier limit of **8,000 tokens per minute**. Actual work (model + search + fetch + backend) was about 23 seconds. The 6 steps had to be spread over about 4 minutes because each prompt was 3-5k tokens. The tracker is slow because of the quota, not the network.

## 3. "New"

Two layers, because two different things can repeat.

**Same URL.** `canonical_url()` lowercases the host, drops `www.`, fragments and tracking parameters (`utm_*`, `fbclid`, ...), sorts the query and trims trailing slashes. A canonical URL already stored as `fetched` is skipped with no request. A *different* URL with identical page text is caught by a SHA-256 of the normalized text (`skipped: same content as an article already seen`).

**Same development, new URL.** The model must say whether an item reports one of the earlier developments (`existing_id`), but the code does not take its word for it. In `finish.validate()`:
1. If a cited URL is already attached to an earlier development, it merges.
2. Otherwise it compares the item's title and summary with every earlier development using cosine similarity of term-frequency vectors (stop words removed). At **0.70 or above** it merges even if the model said "new".
3. If the model claimed a match but the similarity is under **0.12** and no URL is shared, it refuses the claim and treats the item as new.

**A case my method gets wrong.** Measured with the real function:

| Pair | Score | Truth |
|---|---|---|
| "Acme raises $20M seed round to build Vault, a private memory store for AI chats" vs. "Acme raises $60M Series A to build Vault, a private memory store for AI chats" | **0.78** | **different events**, wrongly merged |
| "Acme cuts Vault price to $9 per month" vs. "Vault subscribers now pay less: Acme lowers its monthly fee" | **0.29** | the **same event**, not merged by code (it relies on the model's `existing_id`, and the 0.12 floor accepts it) |

Lexical overlap measures shared vocabulary, not shared facts. Two follow-on events from one company ("seed round", then "Series A") share nearly every word, so the second is folded into the first and the later round is reported as an update to the earlier development. The threshold was 0.60 at first; I raised it to 0.70 after measuring that two unrelated launches from one company already scored 0.64. A number-aware or embedding-based comparison would be better.

## 4. Failure: a 429 comes back

Classification happens in one place, `tracker/http_errors.py`:

```python
if code == 429:
    # A per-day / per-plan cap looks like a 429 but will not clear for hours.
    # Gemini names the exhausted quota (e.g. "...PerDay...") in the body.
    if "perday" in low or "per day" in low or "daily" in low:
        raise DailyQuotaExhausted(f"{service}: daily quota exhausted ({why}). Retrying will not help; try again tomorrow.")
    raise RateLimited(f"{service}: rate limited ({why})", retry_after=_retry_after(resp, body))
```

and the retry loop in `tracker/retry.py` treats the two classes differently:

```python
        except TerminalError:
            raise  # a bad key or a daily cap: retrying is a bug
        except TransientError as e:
            if e.retry_after and e.retry_after > policy.max_retry_after:
                raise RetriesExhausted(...)
            if attempt >= policy.max_retries:
                raise RetriesExhausted(...)
            delay = backoff_delay(policy, attempt, e.retry_after)
            sleep(delay)
```

- **Per-minute limit** (`RateLimited`, a `TransientError`): the server's `Retry-After` (or Gemini's `retryDelay`) is honored, otherwise exponential backoff (2 s, 4 s, 8 s, capped at 30 s, plus jitter), at most **3 retries**. If the server asks for more than 90 s, or the retries run out, the run stops with exit code 3 and says why. Every retry is a line in the trace.
- **Daily cap** (`DailyQuotaExhausted`, a `TerminalError`): **no retry, ever.** The run stops at once, saves what it has, prints `daily quota exhausted ... try again tomorrow`, and exits with code 2.

This was exercised for real, not only in tests. On 2026-10-04 my development runs used up Groq's 200,000 tokens/day for the model, and the next request came back `tokens per day (TPD): Limit 200000, Used 199066`. The tracker made exactly one call, did not retry, wrote a report marked failed and returned exit code 2 (see `Outcome` in `tracker/agent.py`). The same file's tests cover a bad key (`AuthError`), 402 (`PaymentRequired`), Tavily's 432 plan limit and the network cut (3 retries, then give up).

## 5. Budget

**One run** (measured across development runs): 18k to 31k tokens with `qwen/qwen3.8-27b` (typically about 27k; `gpt-oss-120b` needed 42k to 76k because it made one tool call per step), 2 to 4 Tavily credits (one per search), 3 to 8 page fetches (free), and 4 to 16 model calls. At the nominal prices in `config.yaml` that is about **$0.005 per run**, but both free tiers bill nothing. Hard caps per run: 16 steps, 8 fetches, 4 searches, 90,000 tokens, $0.25 (nominal), 900 s.

**If I ran it daily:**

| Free tier | Limit | One daily run uses | Runs out |
|---|---|---|---|
| Groq (`qwen/qwen3.8-27b` or `gpt-oss-120b`) | 200,000 tokens/day per model, 8,000/min | about 27k (about 14%) | never at one run a day. At about 7 runs a day, the same day |
| Tavily | 1,000 credits/month | 2-4 credits (at most 12% of the month at 30 runs) | never at one run a day. At about 250 runs a month |

So with a daily run, **neither runs out**. If I run it more often, **Groq's daily token cap is the first to go**, and not after weeks but within a single day: during development, repeated runs on 2026-10-04 (day 1) exhausted the 200,000-token pool of `qwen/qwen3.8-27b` before the day was over, which is how I tested the daily-cap path. (The cap is per model, and it resets daily.) The binding limit in practice is the per-minute cap (8,000 tokens), which sets how fast a run can go, not how many runs I get. Sources: [Groq rate limits](https://console.groq.com/docs/rate-limits), [Tavily credits](https://docs.tavily.com/documentation/api-credits).
