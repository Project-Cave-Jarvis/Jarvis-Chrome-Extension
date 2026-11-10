import { md } from "./util.js";
import { startOrb } from "./orb.js";
import { getSettings } from "./settings.js";
import { startMic, transcribe, speak } from "./voice.js";

const $ = (s) => document.querySelector(s), logEl = $("#log"), input = $("#cmd");
let state = "idle", amp = 0, hue = 195, port = null, iAsked = false, thinkEl = null, rec = null;
const confirmEls = new Map(), LABEL = { idle: "Online", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

chrome.storage.local.get({ accentHue: 195 }).then((v) => { hue = v.accentHue; document.documentElement.style.setProperty("--h", hue); });
startOrb($("#mini"), { get state() { return state; }, get amp() { return amp; }, get hue() { return hue; } }, { particles: 160 });
getSettings().then((s) => ($("#privText").textContent = `Can't see your screen or pages  \u00b7  ${s.privacy} privacy`));
const setState = (s) => { state = s; $("#st").textContent = LABEL[s]; };

function add(cls, html, isText) { const d = document.createElement("div"); d.className = "msg " + cls; if (isText) d.textContent = html; else d.innerHTML = html; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; return d; }
const showThinking = () => { thinkEl?.remove(); thinkEl = add("ai dots", "<span></span><span></span><span></span>"); };
const clearThinking = () => { thinkEl?.remove(); thinkEl = null; };
function renderEntry(e) {
  logEl.querySelector(".empty")?.remove();
  if (e.k === "user") add("user", e.text, true); else if (e.k === "ai") add("ai", md(e.text)); else if (e.k === "err") add("err", e.text, true);
  else if (e.k === "tool") { const d = add("", ""); const t = document.createElement("span"); t.className = "tool"; t.textContent = e.text; d.appendChild(t); }
}
function empty() { if (!logEl.children.length) { const d = document.createElement("div"); d.className = "empty"; d.textContent = "Hi. What are we working on?"; logEl.appendChild(d); } }

function ensurePort() {
  if (port) return port;
  port = chrome.runtime.connect({ name: "jarvis" });
  port.onMessage.addListener(onMsg); port.onDisconnect.addListener(() => { port = null; });
  port.postMessage({ type: "hello" }); return port;
}
function onMsg(m) {
  if (m.type === "sync") { logEl.innerHTML = ""; confirmEls.clear(); thinkEl = null; m.log.forEach(renderEntry); empty(); if (m.busy) { setState("thinking"); showThinking(); } }
  else if (m.type === "log") {
    clearThinking(); renderEntry(m.entry); if (m.entry.k === "tool") showThinking();
    if (m.entry.k === "ai" && iAsked) { iAsked = false; getSettings().then((s) => s.speak && speak(m.entry.text, () => setState("speaking"), () => setState("idle"))); }
    if (m.entry.k === "err") iAsked = false;
  } else if (m.type === "state") {
    if (m.state === "thinking") { if (state === "idle") setState("thinking"); if (!thinkEl) showThinking(); } else { clearThinking(); if (state === "thinking") setState("idle"); }
  } else if (m.type === "confirm") {
    clearThinking(); const d = add("confirm", ""); d.append(document.createTextNode(m.text + " "));
    for (const [label, ok] of [["Allow", true], ["Deny", false]]) { const b = document.createElement("button"); b.textContent = label; b.onclick = () => port?.postMessage({ type: "confirm_reply", id: m.id, ok }); d.appendChild(b); }
    confirmEls.set(m.id, d);
  } else if (m.type === "confirm_done") { confirmEls.get(m.id)?.remove(); confirmEls.delete(m.id); showThinking(); }
}
const send = (text) => { if (!text.trim()) return; iAsked = true; ensurePort().postMessage({ type: "chat", text }); };

input.addEventListener("keydown", (e) => { if (e.key === "Enter") { send(input.value); input.value = ""; } });
document.querySelectorAll("#chips button").forEach((b) => (b.onclick = () => send(b.dataset.p)));
$("#new").onclick = () => ensurePort().postMessage({ type: "reset" });
$("#close").onclick = () => chrome.runtime.sendMessage({ type: "panel-close" });
$("#hide").onclick = () => chrome.runtime.sendMessage({ type: "hide-site" });
$("#priv").onclick = () => chrome.runtime.openOptionsPage();
document.addEventListener("keydown", (e) => { if (e.key === "Escape") chrome.runtime.sendMessage({ type: "panel-close" }); });

$("#mic").onclick = async () => {
  try {
    if (rec) { const r = rec; rec = null; $("#mic").classList.remove("rec"); setState("thinking"); const text = await transcribe(await r.stop()); setState("idle"); if (text) send(text); return; }
    speechSynthesis.cancel(); rec = await startMic((a) => (amp = a)); $("#mic").classList.add("rec"); setState("listening");
  } catch (e) { rec = null; $("#mic").classList.remove("rec"); setState("idle"); add("err", /denied|dismissed|NotAllowed/i.test(e.message) ? "Microphone isn't available in this panel. Voice works on the new tab page." : e.message, true); }
};
document.addEventListener("visibilitychange", () => { if (!document.hidden) port ? port.postMessage({ type: "hello" }) : ensurePort(); });
ensurePort(); input.focus();
