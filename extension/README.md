# Relay extension (prototype)

Records your AI chats while the browser is open and hands them to another AI tool.
ChatGPT, Gemini, Claude, Copilot, Grok and Perplexity pages.

- A content script reads the chat on the page and sends it to the background worker, which keeps it in `chrome.storage.session`.
- That store lives in memory only: a page reload keeps it, quitting the browser erases it. Closing the last browser window clears it too (macOS keeps the browser running with no windows).
- It holds the whole conversation, up to about 8 MB. Past that, the least recently updated conversations are dropped.
- On a different AI site a panel appears: "Paste context" plus suggestion chips built from the latest chat on another site.
- Nothing is sent to the Relay server (zero retention rule).

## Try it
1. Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> select this `extension/` folder.
2. Chat on chatgpt.com (ask for a list, e.g. pasta ideas from your pantry), wait ~2 seconds.
3. Open gemini.google.com in another tab. The panel appears within ~3 seconds. Reload the first tab: the chat is still recorded.

Tests for the storage worker: `node --test extension/tests`.

## Known limits
- Page selectors are not an official API and will break when the sites change. ChatGPT, Gemini and Claude come from the first prototype; Copilot, Grok and Perplexity are best guesses and have not been tested on the live sites.
- Individual tabs and windows closing does not erase anything while another window is open. Only quitting the browser or closing the last window does.
- Suggestions are heuristic (bullet items from the last reply), not LLM-written. Next step: ask the backend `/llm` for suggestions, sent only when the user opts in.
- MCP server (so Claude or Cursor can fetch the latest context) is not built yet.
