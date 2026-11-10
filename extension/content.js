// Relay context handoff (prototype).
// Records the live chat on the page into chrome.storage.session (via the background worker),
// so it survives a reload and is erased when the browser closes, and offers it on a
// different AI site. Nothing leaves the browser.
(() => {
  const MAX_MSGS = 8; // how many recent messages go into a pasted context block
  const MAX_CHARS = 1200;

  const liTexts = (el) => [...el.querySelectorAll("li")].map((li) => li.innerText.trim());
  const pick = (el, role) => ({ role, text: el.innerText.trim(), li: liTexts(el) });

  // Page selectors are not an official API and break when the sites change. ChatGPT, Gemini
  // and Claude carry over from the first prototype; Copilot, Grok and Perplexity are best
  // guesses that have not been tested on the live sites yet.
  const chatgpt = {
    name: "ChatGPT",
    messages: () =>
      [...document.querySelectorAll("[data-message-author-role]")].map((el) =>
        pick(el, el.getAttribute("data-message-author-role") === "user" ? "user" : "assistant")
      ),
    input: () => document.querySelector("#prompt-textarea"),
  };
  const SITES = {
    "chatgpt.com": chatgpt,
    "chat.openai.com": chatgpt,
    "gemini.google.com": {
      name: "Gemini",
      messages: () =>
        [...document.querySelectorAll("user-query, model-response")].map((el) =>
          pick(el, el.tagName.toLowerCase() === "user-query" ? "user" : "assistant")
        ),
      input: () => document.querySelector("rich-textarea .ql-editor, div[contenteditable='true']"),
    },
    "claude.ai": {
      name: "Claude",
      messages: () =>
        [...document.querySelectorAll("[data-testid='user-message'], .font-claude-response")].map((el) =>
          pick(el, el.getAttribute("data-testid") === "user-message" ? "user" : "assistant")
        ),
      input: () => document.querySelector("div[contenteditable='true']"),
    },
    "copilot.microsoft.com": {
      name: "Copilot",
      messages: () =>
        [...document.querySelectorAll("[data-content='user-message'], [data-content='ai-message']")].map((el) =>
          pick(el, el.getAttribute("data-content") === "user-message" ? "user" : "assistant")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
    "grok.com": {
      name: "Grok",
      messages: () =>
        [...document.querySelectorAll("div[id^='response-']")].map((el) =>
          pick(el, el.classList.contains("items-end") ? "user" : "assistant")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
    "www.perplexity.ai": {
      name: "Perplexity",
      messages: () =>
        [...document.querySelectorAll("[id^='markdown-content-'], h1[class*='query'], div[class*='group/query']")].map((el) =>
          pick(el, el.id.startsWith("markdown-content-") ? "assistant" : "user")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
  };

  const site = SITES[location.hostname];
  if (!site) return;

  // All storage goes through the background worker (see background.js).
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r));
      } catch {
        resolve(null); // the extension was reloaded while this tab stayed open
      }
    });
  const convId = () => (location.pathname.replace(/\/+$/, "") || "/new") + location.search;

  // ---- summarize on the device ----
  function bullets(msg) {
    const lines = msg.li && msg.li.length
      ? msg.li
      : msg.text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
          .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""));
    return lines
      .map((l) => l.replace(/\*\*/g, ""))
      .map((l) => l.split(/[:\-–—]/)[0].trim())
      .filter((l) => l.length > 1 && l.length < 60);
  }

  // The summary shown in the panel is built from the stored conversation when it is read.
  function summarize(conv) {
    const recent = conv.messages.slice(-MAX_MSGS).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS), li: m.li }));
    const firstUser = conv.messages.find((m) => m.role === "user");
    const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");
    return {
      source: conv.source,
      host: conv.host,
      savedAt: conv.updatedAt,
      topic: firstUser ? firstUser.text.split("\n")[0].slice(0, 140) : "",
      items: lastAssistant ? bullets(lastAssistant).slice(0, 8) : [],
      messages: recent,
    };
  }

  // ---- capture ----
  let lastSig = "";
  async function capture() {
    const msgs = site.messages().filter((m) => m.text);
    if (!msgs.length) return;
    const id = convId();
    const sig = id + ":" + msgs.length + ":" + msgs[msgs.length - 1].text.length;
    if (sig === lastSig) return;
    lastSig = sig;
    // Long chats can drop old messages from the page; keep the longer record.
    const prev = await send({ type: "load", host: location.hostname, id });
    const messages = prev && prev.messages.length > msgs.length ? prev.messages : msgs;
    send({
      type: "save",
      conv: { id, host: location.hostname, source: site.name, url: location.href, title: document.title, messages, updatedAt: Date.now() },
    });
  }
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(capture, 1500);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  capture();

  // ---- build prompts ----
  function contextBlock(ctx) {
    const lines = ctx.messages.map((m) => `${m.role === "user" ? "Me" : ctx.source}: ${m.text}`);
    return `Context from my recent ${ctx.source} conversation (via Relay):\n${lines.join("\n")}\n\n`;
  }

  function suggestions(ctx) {
    const out = [];
    const list = ctx.items.slice(0, 5).join(", ");
    if (list) {
      out.push({ label: `Find where to buy: ${list.slice(0, 50)}`, prompt: `Find stores near me where I can buy: ${list}.` });
      out.push({ label: "Compare prices online", prompt: `Compare prices and delivery options online for: ${list}.` });
    }
    if (ctx.topic) out.push({ label: `Continue: ${ctx.topic.slice(0, 45)}`, prompt: "Continue helping me with this." });
    return out;
  }

  function insert(text) {
    const box = site.input();
    if (!box) return alert("Relay: couldn't find the chat box on this page.");
    box.focus();
    document.execCommand("insertText", false, text);
  }

  // ---- UI ----
  function showPanel(ctx) {
    document.getElementById("ezw-panel")?.remove();
    const mins = Math.max(0, Math.round((Date.now() - ctx.savedAt) / 60000));
    const el = document.createElement("div");
    el.id = "ezw-panel";
    el.innerHTML = `<div class="ezw-head"><span class="ezw-title"><img class="ezw-logo" alt="" src="${chrome.runtime.getURL("icons/wallet-dark-48.png")}">Relay</span><button class="ezw-x" title="Dismiss">✕</button></div>
      <div class="ezw-sub">From ${ctx.source}, ${mins === 0 ? "just now" : mins + " min ago"}${ctx.topic ? ": " + ctx.topic.replace(/</g, "&lt;") : ""}</div>`;
    const add = (label, cls, fn) => {
      const b = document.createElement("button");
      if (cls) b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      el.appendChild(b);
    };
    add("Paste context", "ezw-primary", () => insert(contextBlock(ctx)));
    suggestions(ctx).forEach((s) => add(s.label, "", () => insert(contextBlock(ctx) + s.prompt)));
    el.querySelector(".ezw-x").onclick = () => el.remove();
    document.body.appendChild(el);
  }

  async function check() {
    const conv = await send({ type: "latest", host: location.hostname });
    const existing = document.getElementById("ezw-panel");
    if (!conv) {
      existing?.remove();
      return;
    }
    const ctx = summarize(conv);
    if (!existing || existing.dataset.t !== String(ctx.savedAt)) {
      showPanel(ctx);
      document.getElementById("ezw-panel").dataset.t = String(ctx.savedAt);
    }
  }
  setInterval(check, 3000);
  check();
})();
