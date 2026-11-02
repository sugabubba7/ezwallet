# EZ Wallet vs. Aicoo

Written for: you (the owner), as a positioning and strategy note.

**Sources and limits.** Aicoo's app at `aicoo.io/app` is a login-gated shell that shows only "Opening your workspace…", so I could not see inside it. Everything below about Aicoo comes from its public landing page (`aicoo.io`) and its Product Hunt listing, both read on 2026-11-02. If a claim matters, check it by signing up. Statements about EZ Wallet come from `CLAUDE.md` and the code; each is marked **built** or **planned**.

## 1. They are not the same kind of product

The most useful finding: Aicoo is **not** a data wallet. It describes itself as an AI "COO" for small teams: "Docs, to-dos and meetings in one calm place." Its assistant "proposes, you approve."

| | Aicoo | EZ Wallet |
|---|---|---|
| Core job | Run a team's work: docs, to-dos, meetings | Own and control your personal data across AI tools |
| Unit of value | A shared workspace | A private vault and a cross-AI view |
| Default audience | Small teams (Max tier: one heavy user) | One person using many AIs |
| Where the AI lives | Inside Aicoo (its own chat and meeting assistant) | Outside: your existing ChatGPT, Claude, Gemini |
| Data stance | Check access on every request; storage and encryption not stated publicly | Zero retention for conversations; encrypted, PIN-locked vault |
| Money | Free / Pro $15 / Max $200 / Team $15 per person; credits that reset monthly | Not charging yet |

The overlap is small but real: both connect to AI coding agents, and both say they "remember". The risk is that Aicoo's agent connections (Claude Code, Codex, Cursor, OpenClaw, OpenHands, one pasted line) make it the default place where a user's context lives. That is the part to out-position.

## 2. How you work differently

| Dimension | Aicoo | EZ Wallet |
|---|---|---|
| **Direction of data** | Pulls your work into Aicoo (imports from Notion, Google Docs, OneNote) | Keeps data with you; shares only what you pick, per AI |
| **Who is the AI** | Aicoo's own assistant | Whichever AI you already use. EZ Wallet is neutral |
| **Lock-in** | Your docs and meetings live in its workspace | Pulls data out of each AI's memory into your vault and helps delete it at the source (**planned**) |
| **Approval model** | AI proposes edits to shared docs, you approve | You approve what leaves the vault, and saving is never automatic (**built** for cards) |
| **Trust model** | Trust the platform to check access | Trust the math: Fernet-encrypted cards behind an argon2id PIN (**built**) |
| **Conversations** | Meetings are transcribed and kept as notes | Raw prompts and replies are never stored on the server; only titles, tags, timestamps and message counts (**built**) |
| **Checks on sensitive data** | Not advertised | Personal-data warning runs on the device before you send to an AI (**planned**, extension) |
| **Failure memory** | Not advertised | Museum of Failures: problems you hit and exactly how you fixed them (**planned**) |

## 3. How you provide the service differently

1. **Cross-AI by design.** One list of chats across ChatGPT, Claude, Gemini and others, with date, time and message count. Aicoo has no stated view of your chats elsewhere.
2. **Individual first.** A person with no team can use EZ Wallet fully on day one. Aicoo's strongest tiers and sharing features assume a team.
3. **Data leaves the company's memory, not just enters yours.** Importing and deleting from each AI's memory is the opposite of a workspace that collects your data.
4. **Stateless server.** Because conversations are never stored, there is nothing about your chats to leak, subpoena or train on. That is a simpler promise than "access is checked on every request".
5. **Pay-less, lower friction.** Aicoo meters usage in credits. A vault does not need metered AI usage; the cost to run per user is small, which leaves room for a free tier.

## 4. Where Aicoo is ahead (be honest about this)

- A finished, multi-platform product: web, Mac, Windows, iPhone, Android. EZ Wallet is a website, with a Chrome extension still to build.
- Real paying tiers and a team plan, plus a "bring your own model key" option.
- Meetings, docs and to-dos already working together. EZ Wallet has no workflow features.
- Agent connections with clear permission controls (read-only mode, approval code, activity log, disconnect any time).
- Product Hunt traction, 2026 launch, five 5-star reviews. Reviewers praise the UI and the free tier.

## 5. Ways to get ahead of the curve

Ordered by how much each gets you per unit of work.

1. **Ship the extension with the personal-data warning first.** It is the one feature that is clearly yours: warn before you send, checked on the device, nothing leaves the browser. Aicoo cannot copy it easily because it does not sit in other AIs' chat boxes.
2. **Make the zero-retention claim provable.** Publish a one-page "what we store / what we never store" table, and a test that fails if the server ever persists a prompt. Aicoo's public page is silent on storage and encryption, so a concrete, checkable promise is a gap you can own.
3. **Be the "agent-safe" vault.** Aicoo lets agents connect with one line. Offer the same for your vault (an MCP server that returns only the cards you pre-approved, per agent, read-only by default, with an activity log). This turns their strongest feature into a place where you are stricter, not just similar.
4. **Do the Gemini import, then ChatGPT and Claude exports.** The cross-AI chat list is your hook. MemoryPlugin already imports from six sources, so speed matters here.
5. **Launch the Museum of Failures.** It came from your user research, nobody in this list advertises it, and it fits vibe coders who use Claude Code, Cursor and Codex, the same users Aicoo's agent integration targets.
6. **Be explicit about one person, not a team.** Say "for you, not your company" on the landing page. It is the clearest line between you and Aicoo, and it avoids competing on features you do not have.
7. **Offer export and delete first.** One-click "export everything" and "delete everything", visible on the first screen, are cheap to build and give a trust edge over a workspace that holds your documents.
8. **Do not chase Aicoo's features.** Docs, meetings and team sharing are a different product with a head start. Each hour spent there is an hour not spent on the things above.

## 6. Risks to watch

- **Aicoo moves into personal context.** Its chat "can speak up, remember, and tidy up". If it adds cross-AI memory export, the gap narrows. Re-check its site monthly.
- **MemoryPlugin is closer than Aicoo.** It is a paid cross-AI memory layer with chat import and a browser extension. Your answer to it is the same: local checks, a locked vault, and zero retention.
- **Platform changes.** ChatGPT, Gemini and Claude have no API for reading chats. An extension depends on their page structure and can break.
- **Legal.** Before charging money or storing real user data, ask the `lex` agent, especially given your F1 status.
