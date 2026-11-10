import { favicon, hostOf, looksLikeUrl } from "./util.js";

const ICON = {
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>',
  tab: '<svg viewBox="0 0 24 24"><path d="M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h10v4h8v10z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.9 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14a8.2 8.2 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14a16.5 16.5 0 0 0 0-4h3.38a8.2 8.2 0 0 1 0 4z"/></svg>',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ROWS = 10;

export function initSuggest({ input, box, getMode, ask, search, go }) {
  let rows = [], sel = -1, token = 0, timer = 0, webOn = true;
  chrome.storage.local.get({ webSuggest: true }).then((v) => (webOn = v.webSuggest));
  chrome.storage.onChanged.addListener((c) => { if (c.webSuggest) webOn = c.webSuggest.newValue; });

  const close = () => { token++; rows = []; sel = -1; box.hidden = true; box.replaceChildren(); };
  const activate = (r) => { const run = r.run; close(); input.value = ""; run(); };
  const mark = () => [...box.children].forEach((el, i) => el.classList.toggle("on", i === sel));

  function render() {
    box.replaceChildren();
    if (!rows.length) { box.hidden = true; return; }
    rows.forEach((r, i) => {
      const el = document.createElement("div"); el.className = "srow" + (i === sel ? " on" : ""); el.dataset.kind = r.kind;
      const ic = document.createElement("span"); ic.className = "sicon";
      if (r.img) { const im = document.createElement("img"); im.src = r.img; im.onerror = () => { ic.innerHTML = ICON.globe; }; ic.appendChild(im); }
      else ic.innerHTML = r.svg;
      const m = document.createElement("span"); m.className = "smain"; m.textContent = r.label; el.append(ic, m);
      if (r.sub) { const s = document.createElement("span"); s.className = "ssub"; s.textContent = r.sub; el.append(s); }
      el.onmousedown = (e) => { e.preventDefault(); activate(r); };
      el.onmouseenter = () => { sel = i; mark(); };
      box.appendChild(el);
    });
    box.hidden = false;
  }

  async function fetchWeb(q) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 1500);
    try {
      const r = await fetch("https://suggestqueries.google.com/complete/search?client=chrome&q=" + encodeURIComponent(q), { signal: ctl.signal });
      return ((await r.json())[1] || []).filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 4);
    } catch { return []; } finally { clearTimeout(to); }
  }

  async function build(q) {
    const my = ++token; sel = -1;
    const lower = q.toLowerCase();
    const jarvis = { kind: "jarvis", svg: ICON.spark, label: q, sub: "Ask Jarvis", run: () => ask(q) };
    const web = { kind: "search", svg: ICON.search, label: q, sub: "Search the web", run: () => search(q) };
    const parts = {
      top: looksLikeUrl(q) ? [{ kind: "url", svg: ICON.go, label: q, sub: "Go to site", run: () => go(q) }] : [],
      first: getMode() === "web" ? [web, jarvis] : [jarvis, web], tabs: [], local: [], sugg: [],
    };
    const compose = () => {
      rows = [...parts.top, ...parts.first, ...parts.tabs, ...parts.local, ...parts.sugg].slice(0, MAX_ROWS);
      if (sel >= rows.length) sel = -1;
      render();
    };
    compose();

    const safe = (p) => p.catch(() => []);
    const [tabs, hist, bms] = await Promise.all([
      safe(chrome.tabs.query({})), safe(chrome.history.search({ text: q, maxResults: 8, startTime: 0 })), safe(chrome.bookmarks.search(q)),
    ]);
    if (my !== token) return;
    const seen = new Set();
    parts.tabs = tabs.filter((t) => t.url && !t.url.includes(chrome.runtime.id) && `${t.title} ${t.url}`.toLowerCase().includes(lower)).slice(0, 2).map((t) => {
      seen.add(t.url);
      return { kind: "tab", img: favicon(t.url, 32), label: t.title || hostOf(t.url), sub: "Switch to tab", run: () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); } };
    });
    const local = [];
    for (const b of bms.filter((b) => b.url)) if (!seen.has(b.url) && local.length < 2) { seen.add(b.url); local.push({ kind: "bookmark", img: favicon(b.url, 32), label: b.title || hostOf(b.url), sub: hostOf(b.url) + "  \u2605", run: () => go(b.url) }); }
    for (const h of hist) if (!seen.has(h.url) && local.length < 4) { seen.add(h.url); local.push({ kind: "history", img: favicon(h.url, 32), label: h.title || hostOf(h.url), sub: hostOf(h.url), run: () => go(h.url) }); }
    parts.local = local; compose();

    if (webOn) {
      await sleep(120); if (my !== token) return;
      const s = await fetchWeb(q); if (my !== token) return;
      parts.sugg = s.map((t) => ({ kind: "sugg", svg: ICON.search, label: t, run: () => search(t) }));
      compose();
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    timer = setTimeout(() => build(q), 60);
  });
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); sel += e.key === "ArrowDown" ? 1 : -1;
      if (sel < -1) sel = rows.length - 1; if (sel >= rows.length) sel = -1; mark();
    } else if (e.key === "Enter" && sel >= 0 && !e.shiftKey) {
      e.preventDefault(); e.stopImmediatePropagation(); activate(rows[sel]);
    } else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  return { refresh() { const q = input.value.trim(); if (q) build(q); }, close };
}
