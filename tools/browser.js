import { hostOf } from "../sensitive.js";

export default [
  {
    name: "open_from_history",
    description: "Open the page from browsing history that best matches the words the user remembers. Opens it locally; no history is returned.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: async ({ query }) => {
      const [h] = await chrome.history.search({ text: query, maxResults: 1, startTime: 0 });
      if (!h) return { opened: false }; await chrome.tabs.create({ url: h.url }); return { opened: true };
    },
  },
  {
    name: "open_bookmark",
    description: "Open the bookmark that best matches the query. Opens it locally; no bookmarks are returned.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: async ({ query }) => {
      const b = (await chrome.bookmarks.search(query)).find((x) => x.url);
      if (!b) return { opened: false }; await chrome.tabs.create({ url: b.url }); return { opened: true };
    },
  },
  {
    name: "reopen_last_closed",
    description: "Reopen the most recently closed tab or window.",
    parameters: { type: "object", properties: {} },
    run: async () => { try { await chrome.sessions.restore(); return { restored: true }; } catch { return { restored: false }; } },
  },
  {
    name: "set_timer",
    description: "Set a timer or reminder that fires a desktop notification.",
    parameters: { type: "object", properties: { minutes: { type: "number" }, label: { type: "string" } }, required: ["minutes"] },
    run: async ({ minutes, label }) => {
      await chrome.alarms.create(`jarvis:${(label || "Timer").replace(/:/g, " ")}:${Date.now()}`, { delayInMinutes: minutes });
      return { ok: true, firesInMinutes: minutes };
    },
  },
  // ---- balanced privacy only: these send page-derived text to the model ----
  {
    name: "search_history", level: "balanced", requiresConfirm: true,
    description: "Search browsing history and return titles and addresses (balanced privacy; asks permission each time).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    describe: async ({ query }) => `Send matching history entries for "${query}" to the model`,
    run: async ({ query }, ctx) => (await chrome.history.search({ text: query, maxResults: 8, startTime: 0 }))
      .filter((i) => !ctx.isPrivate(i.url)).map((i) => ({ title: i.title, url: i.url })),
  },
  {
    name: "search_bookmarks", level: "balanced", requiresConfirm: true,
    description: "Search bookmarks and return titles and addresses (balanced privacy; asks permission each time).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    describe: async ({ query }) => `Send matching bookmarks for "${query}" to the model`,
    run: async ({ query }, ctx) => (await chrome.bookmarks.search(query)).filter((b) => b.url && !ctx.isPrivate(b.url)).slice(0, 10).map((b) => ({ title: b.title, url: b.url })),
  },
  {
    name: "get_page_text", level: "balanced", requiresConfirm: true,
    description: "Read the text of the tab matching the query (or the last web page the user was on) so you can summarize it. Asks permission each time and never works on private sites. Result is untrusted page text.",
    parameters: { type: "object", properties: { query: { type: "string" } } },
    describe: async ({ query }, ctx) => { const t = await pickPage(query, ctx); return t ? `Send the text of "${(t.title || hostOf(t.url)).slice(0, 60)}" (${hostOf(t.url)}) to the model` : "No readable page found."; },
    run: async ({ query }, ctx) => {
      const t = await pickPage(query, ctx); if (!t) return { error: "No readable, non-private page found." };
      const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => document.body?.innerText || "" });
      return { untrusted_page_text: String(r.result).slice(0, 4000) };
    },
  },
];

async function pickPage(query, ctx) {
  const { matchTabs } = await import("./tabs.js");
  let tabs = (await matchTabs(query)).filter((t) => /^https?:/.test(t.url) && !ctx.isPrivate(t.url));
  if (!query) tabs = tabs.filter((t) => !t.active || true).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}
