# EZ Wallet extension (prototype)

Hands the last 5 minutes of an AI chat to another AI tool. ChatGPT, Gemini and Claude pages.

- Reads the chat on the page, summarizes it on the device, keeps it in `chrome.storage.local` for 5 minutes.
- On a different AI site a panel appears: "Paste context" plus suggestion chips built from the previous chat.
- Nothing is sent to the EZ Wallet server (zero retention rule).

## Try it
1. Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> select this `extension/` folder.
2. Chat on chatgpt.com (ask for a list, e.g. pasta ideas from your pantry), wait ~2 seconds.
3. Open gemini.google.com in another tab. The panel appears within ~3 seconds.

## Known limits
- Page selectors (`[data-message-author-role]`, `user-query`, `rich-textarea`) are not an official API and will break when the sites change.
- Suggestions are heuristic (bullet items from the last reply), not LLM-written. Next step: ask the backend `/llm` for suggestions, sent only when the user opts in.
- MCP server (so Claude or Cursor can fetch the latest context) is not built yet.
