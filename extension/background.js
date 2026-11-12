// Relay background worker. Keeps recorded conversations in chrome.storage.session:
// held in memory only, so a page reload keeps them and quitting the browser erases them.
// Content scripts talk to this worker by message instead of touching storage directly.
const PREFIX = "conv:";
const MAX_BYTES = 8 * 1024 * 1024; // storage.session allows about 10 MB
const LEADOFF = "leadoff"; // the first AI used in this browser session; cleared with the rest when it ends

let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function save(conv) {
  const key = PREFIX + conv.host + ":" + conv.id;
  await chrome.storage.session.set({ [key]: conv });
  if (!(await chrome.storage.session.get(LEADOFF))[LEADOFF]) {
    await chrome.storage.session.set({ [LEADOFF]: { host: conv.host, source: conv.source, at: Date.now() } });
  }
  // Over budget: drop the least recently updated conversations, never the one just saved.
  let used = await chrome.storage.session.getBytesInUse(null);
  if (used <= MAX_BYTES) return;
  const all = await chrome.storage.session.get(null);
  const old = Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX) && k !== key)
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  for (const [k] of old) {
    await chrome.storage.session.remove(k);
    used = await chrome.storage.session.getBytesInUse(null);
    if (used <= MAX_BYTES) break;
  }
}

async function load(host, id) {
  const key = PREFIX + host + ":" + id;
  return (await chrome.storage.session.get(key))[key] || null;
}

// Most recently updated conversation from a site other than `host`.
async function latestOther(host) {
  const all = await chrome.storage.session.get(null);
  return (
    Object.entries(all)
      .filter(([k, v]) => k.startsWith(PREFIX) && v.host !== host && v.messages?.length)
      .map(([, v]) => v)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null
  );
}

async function list() {
  const all = await chrome.storage.session.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([, v]) => ({ host: v.host, source: v.source, id: v.id, title: v.title, count: v.messages.length, updatedAt: v.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "badge") {
    // Shows on the toolbar icon for that tab: how many messages Relay can read there.
    if (sender.tab) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: String(msg.count) });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: msg.count ? "#2A2A2E" : "#B00020" });
    }
    return false;
  }
  serial(async () => {
    if (msg.type === "save") return void (await save(msg.conv));
    if (msg.type === "load") return load(msg.host, msg.id);
    if (msg.type === "latest") return latestOther(msg.host);
    if (msg.type === "list") return list();
    if (msg.type === "leadoff") return (await chrome.storage.session.get(LEADOFF))[LEADOFF] || null;
  }).then(reply, () => reply(null));
  return true;
});

// On macOS the browser keeps running with no windows, so the session store would
// outlive the last window. Clear it then too: closing every window erases the data.
chrome.windows.onRemoved.addListener(async () => {
  const left = await chrome.windows.getAll();
  if (left.length === 0) await chrome.storage.session.clear();
});
