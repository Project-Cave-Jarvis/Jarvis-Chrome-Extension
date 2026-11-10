// Tab tools take plain-text queries and resolve them locally, so the model never needs to see your tabs.
import { hostOf } from "../sensitive.js";

const selfUrl = chrome.runtime.getURL("");
export async function allTabs() {
  return (await chrome.tabs.query({})).filter((t) => !t.incognito && t.url && !t.url.startsWith(selfUrl));
}
const terms = (q) => (q || "").toLowerCase().split(/\s+/).filter(Boolean);
export async function matchTabs(query) {
  const ts = terms(query), tabs = await allTabs();
  return ts.length ? tabs.filter((t) => { const h = `${t.title} ${t.url}`.toLowerCase(); return ts.every((x) => h.includes(x)); }) : tabs;
}
const label = (t) => (t.title || hostOf(t.url) || t.url).slice(0, 60);
const q = { query: { type: "string", description: "Words from the tab title or site, as the user said them" } };
const dupKey = (t) => t.url.split("#")[0];
async function duplicates() {
  const tabs = await allTabs(), seen = new Map(), dups = [];
  for (const t of tabs.sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))) {
    const k = dupKey(t); if (seen.has(k)) dups.push(t); else seen.set(k, t);
  }
  return dups;
}

export default [
  {
    name: "tab_stats",
    description: "Counts of open tabs: total, windows, pinned, audible, duplicates. Contains no page information.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const tabs = await allTabs();
      return { total: tabs.length, windows: new Set(tabs.map((t) => t.windowId)).size, pinned: tabs.filter((t) => t.pinned).length, audible: tabs.filter((t) => t.audible).length, duplicates: (await duplicates()).length };
    },
  },
  {
    name: "list_tabs", level: "balanced",
    description: "List open tabs with their site and title (balanced privacy only).",
    parameters: { type: "object", properties: q },
    run: async ({ query }, ctx) => (await matchTabs(query)).slice(0, 40).map((t) =>
      ctx.isPrivate(t.url) ? { id: t.id, site: "private site" } : { id: t.id, site: hostOf(t.url), title: t.title }),
  },
  {
    name: "switch_to_tab",
    description: "Focus the tab that best matches the query.",
    parameters: { type: "object", properties: q, required: ["query"] },
    run: async ({ query }) => {
      const m = await matchTabs(query); if (!m.length) return { switched: false, matches: 0 };
      const t = m.find((x) => !x.active) || m[0];
      await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true });
      return { switched: true, matches: m.length };
    },
  },
  {
    name: "open_url",
    description: "Open a URL in a new tab. background=true keeps the current tab focused.",
    parameters: { type: "object", properties: { url: { type: "string" }, background: { type: "boolean" } }, required: ["url"] },
    run: async ({ url, background }) => { await chrome.tabs.create({ url, active: !background }); return { opened: true }; },
  },
  {
    name: "web_search",
    description: "Open a web search for the query in a new tab.",
    parameters: { type: "object", properties: q, required: ["query"] },
    run: async ({ query }) => { await chrome.search.query({ text: query, disposition: "NEW_TAB" }); return { opened: true }; },
  },
  {
    name: "close_tabs", requiresConfirm: true,
    description: "Close every tab matching the query. The user is asked to confirm and sees the tab titles.",
    parameters: { type: "object", properties: q, required: ["query"] },
    describe: async ({ query }) => {
      const m = terms(query).length ? await matchTabs(query) : [];
      return m.length ? `Close ${m.length} tab${m.length > 1 ? "s" : ""}: ${m.slice(0, 6).map(label).join("  |  ")}${m.length > 6 ? "  ..." : ""}` : "No matching tabs.";
    },
    run: async ({ query }) => {
      if (!terms(query).length) return { error: "A query is required." };
      const m = await matchTabs(query); if (m.length) await chrome.tabs.remove(m.map((t) => t.id));
      return { closed: m.length };
    },
  },
  {
    name: "close_duplicate_tabs", requiresConfirm: true,
    description: "Close duplicate tabs (same URL), keeping one of each. The user is asked to confirm.",
    parameters: { type: "object", properties: {} },
    describe: async () => { const d = await duplicates(); return d.length ? `Close ${d.length} duplicate tab${d.length > 1 ? "s" : ""}: ${d.slice(0, 6).map(label).join("  |  ")}` : "No duplicates."; },
    run: async () => { const d = await duplicates(); if (d.length) await chrome.tabs.remove(d.map((t) => t.id)); return { closed: d.length }; },
  },
  {
    name: "group_tabs",
    description: "Put every tab matching the query into a named, colored tab group.",
    parameters: { type: "object", properties: { ...q, title: { type: "string" }, color: { type: "string", enum: ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"] } }, required: ["query", "title"] },
    run: async ({ query, title, color }) => {
      if (!terms(query).length) return { error: "A query is required." };
      const m = await matchTabs(query), byWin = {};
      for (const t of m) (byWin[t.windowId] ||= []).push(t.id);
      for (const ids of Object.values(byWin)) { const g = await chrome.tabs.group({ tabIds: ids }); await chrome.tabGroups.update(g, { title, color: color || "cyan" }); }
      return { grouped: m.length };
    },
  },
  {
    name: "group_tabs_by_site",
    description: "Automatically group open tabs by website (sites with 2 or more tabs). Nothing is closed.",
    parameters: { type: "object", properties: {} },
    run: async (_, ctx) => {
      const tabs = (await allTabs()).filter((t) => !ctx.isPrivate(t.url) && /^https?:/.test(t.url)), buckets = {};
      for (const t of tabs) (buckets[`${t.windowId}|${hostOf(t.url)}`] ||= []).push(t);
      let groups = 0, grouped = 0;
      for (const [k, list] of Object.entries(buckets)) {
        if (list.length < 2) continue;
        const g = await chrome.tabs.group({ tabIds: list.map((t) => t.id) });
        await chrome.tabGroups.update(g, { title: k.split("|")[1].split(".").slice(-2, -1)[0] || k.split("|")[1], collapsed: false });
        groups++; grouped += list.length;
      }
      return { groups, tabsGrouped: grouped };
    },
  },
  {
    name: "pin_tab",
    description: "Pin or unpin tabs matching the query.",
    parameters: { type: "object", properties: { ...q, pinned: { type: "boolean" } }, required: ["query", "pinned"] },
    run: async ({ query, pinned }) => { const m = terms(query).length ? await matchTabs(query) : []; for (const t of m) await chrome.tabs.update(t.id, { pinned }); return { changed: m.length }; },
  },
  {
    name: "mute_tabs",
    description: "Mute or unmute tabs matching the query. With an empty query and muted=true it mutes every tab that is currently playing sound.",
    parameters: { type: "object", properties: { ...q, muted: { type: "boolean" } }, required: ["muted"] },
    run: async ({ query, muted }) => {
      const m = terms(query).length ? await matchTabs(query) : (await allTabs()).filter((t) => t.audible);
      for (const t of m) await chrome.tabs.update(t.id, { muted }); return { changed: m.length };
    },
  },
  {
    name: "new_window",
    description: "Open a new browser window, optionally incognito and with a URL.",
    parameters: { type: "object", properties: { url: { type: "string" }, incognito: { type: "boolean" } } },
    run: async ({ url, incognito }) => { await chrome.windows.create({ url, incognito: !!incognito }); return { opened: true }; },
  },
];
