# EZ Wallet Guard

A tiny Chrome extension (Manifest V3) for chatgpt.com and claude.ai. When you press Enter or Send and your message contains an API key, `.env` secret or password, it shows a pop-up (emails and phone numbers only get a quiet "also noticed" line inside it; on their own they never interrupt): **Cover it up** (swaps keys and passwords in your message for placeholders like `[OPENAI_KEY]`; nothing is sent, you review first), **Abort mission** (back to your message), **Send anyway**, or **Pause for this tab**. Private-key blocks and secrets split across lines cannot be covered automatically; the pop-up says so and leaves them for you to edit.

No build step, no dependencies, no login, no server.

## Try it

1. Chrome → `chrome://extensions` → turn on Developer mode → **Load unpacked** → pick this `extension/` folder.
2. Open chatgpt.com or claude.ai, type `DB_PASSWORD=hunter2hunter2`, press Enter.

Tests for the detector: `node --test tests/`

## Why you can trust it (and how to check)

- **Permissions:** the manifest asks for none, only a content script on chatgpt.com, chat.openai.com and claude.ai. No background script, no `storage`, no `host_permissions`, no `webRequest`. Chrome shows this on the install screen.
- **No storage:** pause state and "send anyway" live in memory in the tab and vanish on reload. Matches are never logged.
- **No network:** the code has no `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`. Check with `grep -nE "fetch|XMLHttpRequest|WebSocket|sendBeacon" *.js` (should find nothing). Or open DevTools → Network, press Send with a fake secret, and see that only the site's own requests appear.
- **Masked matches:** the pop-up shows `sk-p••••`, never the full value.

Limits, stated plainly: a content script on these sites can read the page, so you are trusting this code. Chrome auto-updates extensions, so a later version could change; read the diff on updates. Files, drag-and-drop, voice input and edits made after the scan are not checked. The site selectors in `sites.js` can break when ChatGPT or Claude redesign; the extension shows a notice when it cannot find the message box.

## Files

- `detect.js`: pattern rules, `scan(text)` returns matches with masked values (pure, tested)
- `sites.js`: message box and Send button selectors per site (add a site here)
- `content.js`: Enter/Send interception and the pop-up
- `fonts/`: IBM Plex Mono (SIL Open Font License, see `fonts/OFL.txt`), bundled so the pop-up never contacts Google Fonts
- Patterns adapted from gitleaks (MIT) and detect-secrets (Apache-2.0).
