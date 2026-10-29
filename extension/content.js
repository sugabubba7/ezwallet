// EZ Wallet context handoff (prototype).
// Reads the live chat on the page, keeps a short summary in chrome.storage for 5 minutes,
// and offers it on a different AI site. Nothing leaves the browser.
(() => {
  const TTL_MS = 5 * 60 * 1000;
  const KEY = "ezw_ctx";
  const MAX_MSGS = 8;
  const MAX_CHARS = 1200;

  const SITES = {
    "chatgpt.com": {
      name: "ChatGPT",
      messages: () =>
        [...document.querySelectorAll("[data-message-author-role]")].map((el) => ({
          role: el.getAttribute("data-message-author-role") === "user" ? "user" : "assistant",
          text: el.innerText.trim(),
        })),
      input: () => document.querySelector("#prompt-textarea"),
    },
    "gemini.google.com": {
      name: "Gemini",
      messages: () =>
        [...document.querySelectorAll("user-query, model-response")].map((el) => ({
          role: el.tagName.toLowerCase() === "user-query" ? "user" : "assistant",
          text: el.innerText.trim(),
        })),
      input: () => document.querySelector("rich-textarea .ql-editor, div[contenteditable='true']"),
    },
    "claude.ai": {
      name: "Claude",
      messages: () =>
        [...document.querySelectorAll("[data-testid='user-message'], .font-claude-response")].map((el) => ({
          role: el.getAttribute("data-testid") === "user-message" ? "user" : "assistant",
          text: el.innerText.trim(),
        })),
      input: () => document.querySelector("div[contenteditable='true']"),
    },
  };

  const site = SITES[location.hostname];
  if (!site) return;

  const store = {
    get: () => new Promise((r) => chrome.storage.local.get(KEY, (v) => r(v[KEY] || null))),
    set: (ctx) => chrome.storage.local.set({ [KEY]: ctx }),
  };

  // ---- summarize on the device ----
  function bullets(text) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
      .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, ""))
      .map((l) => l.split(/[:\-–—]/)[0].trim())
      .filter((l) => l.length > 1 && l.length < 60);
  }

  function summarize(msgs) {
    const recent = msgs.slice(-MAX_MSGS).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }));
    const firstUser = recent.find((m) => m.role === "user");
    const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");
    return {
      source: site.name,
      host: location.hostname,
      savedAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      topic: firstUser ? firstUser.text.split("\n")[0].slice(0, 140) : "",
      items: lastAssistant ? bullets(lastAssistant.text).slice(0, 8) : [],
      messages: recent,
    };
  }

  // ---- capture ----
  let lastSig = "";
  let paused = false;
  async function capture() {
    if (paused) return;
    const msgs = site.messages().filter((m) => m.text);
    if (!msgs.length) return;
    const sig = msgs.length + ":" + msgs[msgs.length - 1].text.length;
    if (sig === lastSig) return;
    lastSig = sig;
    store.set(summarize(msgs));
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
    return `Context from my recent ${ctx.source} conversation (via EZ Wallet):\n${lines.join("\n")}\n\n`;
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
    if (!box) return alert("EZ Wallet: couldn't find the chat box on this page.");
    box.focus();
    document.execCommand("insertText", false, text);
  }

  // ---- UI ----
  function showPanel(ctx) {
    document.getElementById("ezw-panel")?.remove();
    const mins = Math.max(0, Math.round((Date.now() - ctx.savedAt) / 60000));
    const el = document.createElement("div");
    el.id = "ezw-panel";
    el.innerHTML = `<div class="ezw-head"><span class="ezw-title">EZ Wallet</span><button class="ezw-x" title="Dismiss">✕</button></div>
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
    const ctx = await store.get();
    const existing = document.getElementById("ezw-panel");
    if (!ctx || ctx.expiresAt < Date.now() || ctx.host === location.hostname) {
      existing?.remove();
      return;
    }
    if (!existing || existing.dataset.t !== String(ctx.savedAt)) {
      showPanel(ctx);
      document.getElementById("ezw-panel").dataset.t = String(ctx.savedAt);
    }
  }
  setInterval(check, 3000);
  check();
})();
