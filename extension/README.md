# Relay extension (prototype)

Records your AI chats while the browser is open and hands them to another AI tool.
ChatGPT, Gemini, Claude, Copilot, Grok and Perplexity pages.

- A content script reads the chat on the page and sends it to the background worker, which keeps it in `chrome.storage.session`.
- That store lives in memory only: a page reload keeps it, quitting the browser erases it. Closing the last browser window clears it too (macOS keeps the browser running with no windows).
- It holds the whole conversation, up to about 8 MB. Past that, the least recently updated conversations are dropped.
- On a different AI site a panel appears: "Paste summary" plus suggestion chips built from the latest chat on another site.
- Click the Relay icon in the browser toolbar to choose between two modes, remembered across sessions (only the choice is saved, never any chat):
  - **Baton drop** (default): the context waits and you pick it up by clicking "Paste summary".
  - **Baton pass**: Relay puts the summary into a new, empty chat on its own, once per recorded chat per tab. It never presses send, never writes into a chat that is already under way, and leaves the box alone if you started typing. Review the text before sending, because the summary is not checked for personal details yet.
- A floating Relay icon sits on the right edge of every supported AI page. It is one element: click the wallet icon and it grows into the panel (the icon stays in the top-right corner), click it again and it shrinks back. A closed panel stays closed until a newer chat arrives or you click the icon. With nothing recorded yet, the box says so.
  - **Lead-off:** the first AI you use in a browser session is marked as the lead-off. Its icon has a blue rim, other tabs keep the plain rim and name it in the icon's tooltip, and the panel says "(your lead-off AI)" when the context came from it. It is forgotten when the browser session ends.
  - **Match:** as you type, Relay compares your words with the recorded chat (plain word overlap, no AI). If they relate, the icon changes colour (signal blue). If they do not, it slowly slides aside; hover over it to bring it back. After about 12 typed characters it starts judging, and text Relay itself pasted is ignored.
  - Word overlap is not understanding: a topic worded very differently from the recorded chat can be missed. The colours are two variables at the top of the `#ezw-fab` rule in `panel.css`.
- What gets pasted is a summary, not the transcript, and it never names the AI it came from (brand names are scrubbed, roles are just "Me" and "Assistant"). The summary is rule-based and built on the device, so it is instant: goal, questions asked, key points, where it stopped, and a "Key terms" line of the most important words (counted, with your own words weighted double). Chrome's built-in on-device Summarizer can be switched on with `USE_MODEL` in `content.js`, but it is slow because it loads a model and summarizes chunk by chunk.
- The summary is typed into the chat box in small steps so you can watch it arrive, like an AI answer streaming in. It takes at most 1.5 seconds (`TYPE_MS` in `content.js`; set it to 0 to paste at once). Pressing a key puts the rest in immediately, and reduced-motion settings or a hidden tab skip the effect.
- Nothing is sent to the Relay server (zero retention rule).

## Try it
1. Chrome -> `chrome://extensions` -> Developer mode -> Load unpacked -> select this `extension/` folder.
2. Chat on chatgpt.com (ask for a list, e.g. pasta ideas from your pantry), wait ~2 seconds.
3. Open gemini.google.com in another tab. The panel appears within ~3 seconds. Click "Paste summary". Reload the first tab: the chat is still recorded.

Tests for the storage worker: `node --test extension/tests`.

## Known limits
- Page selectors are not an official API and will break when the sites change. ChatGPT, Gemini and Claude come from the first prototype; Copilot, Grok and Perplexity are best guesses and have not been tested on the live sites.
- The chat box is found with the site's own selector first, then with a generic search for the lowest visible editable box, so a renamed ID on the site does not stop pasting. If a page has several editable boxes at the bottom, the wrong one could be picked.
- Individual tabs and windows closing does not erase anything while another window is open. Only quitting the browser or closing the last window does.
- Suggestions are heuristic (bullet items from the last reply), not LLM-written. Next step: ask the backend `/llm` for suggestions, sent only when the user opts in.
- MCP server (so Claude or Cursor can fetch the latest context) is not built yet.
