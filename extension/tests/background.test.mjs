// Run with: node --test extension/tests
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function boot() {
  const data = {};
  const listeners = {};
  let windows = [1];
  const chrome = {
    storage: {
      session: {
        set: async (o) => void Object.assign(data, JSON.parse(JSON.stringify(o))),
        get: async (k) => (k === null ? { ...data } : { [k]: data[k] }),
        remove: async (k) => void delete data[k],
        clear: async () => void Object.keys(data).forEach((k) => delete data[k]),
        getBytesInUse: async () => JSON.stringify(data).length,
      },
    },
    runtime: { onMessage: { addListener: (f) => (listeners.msg = f) } },
    windows: { onRemoved: { addListener: (f) => (listeners.removed = f) }, getAll: async () => windows },
  };
  vm.runInNewContext(readFileSync(new URL("../background.js", import.meta.url), "utf8"), { chrome, JSON, Object });
  const call = (msg) => new Promise((r) => listeners.msg(msg, {}, r));
  return { data, call, closeAll: async () => { windows = []; await listeners.removed(); } };
}
const conv = (host, id, n, at) => ({ id, host, source: host, messages: Array(n).fill({ role: "user", text: "hi" }), updatedAt: at });

test("saves, loads, and returns the latest conversation from another site", async () => {
  const { call } = boot();
  await call({ type: "save", conv: conv("a.com", "1", 2, 1) });
  await call({ type: "save", conv: conv("b.com", "1", 2, 2) });
  assert.equal((await call({ type: "load", host: "a.com", id: "1" })).updatedAt, 1);
  assert.equal((await call({ type: "latest", host: "a.com" })).host, "b.com");
  assert.equal(await call({ type: "latest", host: "c.com" }).then((c) => c.host), "b.com");
});

test("a reload keeps data: saving the same conversation again replaces it", async () => {
  const { call } = boot();
  await call({ type: "save", conv: conv("a.com", "1", 2, 1) });
  await call({ type: "save", conv: conv("a.com", "1", 4, 2) });
  assert.equal((await call({ type: "list" })).length, 1);
});

test("closing the last window erases everything", async () => {
  const { call, closeAll } = boot();
  await call({ type: "save", conv: conv("a.com", "1", 2, 1) });
  await closeAll();
  assert.deepEqual(await call({ type: "list" }), []);
});

test("over budget, the oldest conversation goes first and the new one stays", async () => {
  const { call } = boot();
  const big = (host, at) => ({ ...conv(host, "1", 1, at), messages: [{ role: "user", text: "x".repeat(3_000_000) }] });
  await call({ type: "save", conv: big("a.com", 1) });
  await call({ type: "save", conv: big("b.com", 2) });
  await call({ type: "save", conv: big("c.com", 3) });
  const hosts = (await call({ type: "list" })).map((c) => c.host);
  assert.deepEqual(hosts, ["c.com", "b.com"]);
});
