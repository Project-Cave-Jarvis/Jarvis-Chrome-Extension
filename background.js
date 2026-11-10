import { tools } from "./tools/index.js";
import { getSettings, RULES } from "./settings.js";
import { createRedactor } from "./privacy.js";
import { isPrivate, hostOf } from "./sensitive.js";

const API = "https://api.groq.com/openai/v1";
const PRESETS = {
  tidy: "Group my open tabs by site. Don't close anything.",
  focus: "Start a 25 minute focus timer.",
  stats: "What's open right now?",
};
const fresh = () => ({ history: [], log: [], red: { map: {}, n: {} } });
let convo = fresh(), busy = false;
const ready = chrome.storage.session.get("convo").then((s) => { if (s.convo) convo = s.convo; });
const persist = () => chrome.storage.session.set({ convo });
const ports = new Set(), pending = new Map();
const broadcast = (m) => { for (const p of ports) { try { p.postMessage(m); } catch {} } };
async function toTabs(m) {
  for (const t of await chrome.tabs.query({})) if (t.id && !t.incognito && /^https?:/.test(t.url || "")) chrome.tabs.sendMessage(t.id, m).catch(() => {});
}
function pushLog(entry) { convo.log.push(entry); if (convo.log.length > 120) convo.log.shift(); persist(); broadcast({ type: "log", entry }); }
function setBusy(b) { busy = b; broadcast({ type: "state", state: b ? "thinking" : "idle" }); toTabs({ type: "state", state: b ? "thinking" : "idle" }); }

function askConfirm(text) {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const done = (ok) => { if (!pending.has(id)) return; pending.delete(id); broadcast({ type: "confirm_done", id }); resolve(ok); };
    pending.set(id, done); setTimeout(() => done(false), 60000);
    broadcast({ type: "confirm", id, text });
  });
}

async function runChat(text) {
  await ready;
  if (busy) return broadcast({ type: "log", entry: { k: "err", text: "Still working on your last request." } });
  const s = await getSettings();
  setBusy(true); pushLog({ k: "user", text });
  try {
    if (!s.apiKey) throw new Error("No Groq API key set. Open Jarvis settings and add one.");
    const red = createRedactor(convo.red);
    const ctx = { privacy: s.privacy, isPrivate: (u) => isPrivate(u, s.privateSites) };
    const active = tools.filter((t) => !s.disabledTools.includes(t.name) && (t.level !== "balanced" || s.privacy === "balanced"));
    const defs = active.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    convo.history.push({ role: "user", content: red.scrub(text) });

    for (let step = 0; step < 8; step++) {
      const body = { model: s.model, temperature: 0.4, messages: [{ role: "system", content: `${s.systemPrompt}\n\n${RULES}` }, ...convo.history], ...(defs.length ? { tools: defs, tool_choice: "auto" } : {}) };
      await chrome.storage.session.set({ lastOutbound: { time: new Date().toISOString(), model: s.model, privacy: s.privacy, messages: body.messages } });
      const res = await fetch(`${s.apiBase || API}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(res.status === 401 ? "Groq rejected the API key (401)." : `Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const msg = (await res.json()).choices[0].message;
      convo.history.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
      if (!msg.tool_calls?.length) { pushLog({ k: "ai", text: red.restore(msg.content || "Done.") }); break; }

      for (const call of msg.tool_calls) {
        const tool = active.find((t) => t.name === call.function.name);
        let args = {}; try { args = red.restoreDeep(JSON.parse(call.function.arguments || "{}")); } catch {}
        pushLog({ k: "tool", text: call.function.name + " " + Object.values(args).map((v) => JSON.stringify(v)).join(" ").slice(0, 60) });
        let result;
        if (!tool) result = { error: "Tool unavailable under the current privacy level." };
        else {
          let ok = true;
          if (tool.requiresConfirm) ok = await askConfirm(tool.describe ? await tool.describe(args, ctx) : `${tool.name} ${JSON.stringify(args)}`);
          if (!ok) result = { error: "User declined." };
          else { try { result = await tool.run(args, ctx); } catch (e) { result = { error: String(e.message || e) }; } }
        }
        convo.history.push({ role: "tool", tool_call_id: call.id, content: red.scrub(JSON.stringify(result)).slice(0, 8000) });
      }
      if (step === 7) pushLog({ k: "ai", text: "I hit my step limit on that one." });
    }
    while (convo.history.length > 40) convo.history.shift();
    while (convo.history.length && convo.history[0].role !== "user") convo.history.shift();
  } catch (e) { pushLog({ k: "err", text: String(e.message || e) }); }
  finally { setBusy(false); persist(); }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "jarvis") return;
  ports.add(port); port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(async (m) => {
    await ready;
    if (m.type === "hello") port.postMessage({ type: "sync", log: convo.log, busy });
    else if (m.type === "chat") runChat(String(m.text || "").slice(0, 4000));
    else if (m.type === "reset" && !busy) { convo = fresh(); persist(); broadcast({ type: "sync", log: [], busy: false }); }
    else if (m.type === "confirm_reply") pending.get(m.id)?.(!!m.ok);
  });
});

/* ---------- presence on every tab ---------- */
const normalTab = (t) => t && t.id && !t.incognito && /^https?:/.test(t.url || "");
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  const tab = sender.tab;
  if (m.type === "presence-check") {
    getSettings().then((s) => reply({ show: s.presence && normalTab(tab) && !s.hiddenSites.includes(hostOf(tab.url)) && !(s.hideOnPrivate && isPrivate(tab.url, s.privateSites)) }));
    return true;
  }
  if (m.type === "preset" && PRESETS[m.preset]) runChat(PRESETS[m.preset]);
  else if (m.type === "panel-close" && tab) chrome.tabs.sendMessage(tab.id, { type: "close" }).catch(() => {});
  else if (m.type === "hide-site" && tab) {
    getSettings().then((s) => { const h = hostOf(tab.url); if (h && !s.hiddenSites.includes(h)) chrome.storage.local.set({ hiddenSites: [...s.hiddenSites, h] }); chrome.tabs.sendMessage(tab.id, { type: "hide" }).catch(() => {}); });
  }
});
async function toggleActive() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "toggle" }).catch(async () => {
    const s = await getSettings();
    if (!tab.url || !isPrivate(tab.url, s.privateSites)) chrome.tabs.create({});
  });
}
chrome.commands.onCommand.addListener((c) => { if (c === "toggle-jarvis") toggleActive(); });
chrome.action.onClicked.addListener(toggleActive);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url) chrome.tabs.sendMessage(id, { type: "recheck" }).catch(() => {}); });

async function nudgeActive(text, preset) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }), s = await getSettings();
  if (normalTab(tab) && !isPrivate(tab.url, s.privateSites)) chrome.tabs.sendMessage(tab.id, { type: "nudge", text, preset }).catch(() => {});
}
chrome.alarms.get("jarvis-nudge").then((a) => { if (!a) chrome.alarms.create("jarvis-nudge", { periodInMinutes: 15 }); });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "jarvis-nudge") {
    const s = await getSettings(); if (!s.nudges || !s.presence) return;
    const n = (await chrome.tabs.query({})).filter((t) => !t.incognito).length;
    const { lastNudge } = await chrome.storage.local.get({ lastNudge: 0 });
    if (n >= 25 && Date.now() - lastNudge > 3 * 3600e3) { await chrome.storage.local.set({ lastNudge: Date.now() }); nudgeActive(`You've got ${n} tabs open. Want me to group them by site?`, "tidy"); }
  } else if (a.name.startsWith("jarvis:")) {
    const label = a.name.split(":")[1] || "Timer";
    chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: "Jarvis", message: `${label} is up.` });
    nudgeActive(`${label} is up.`);
  }
});
