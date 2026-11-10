import { tools } from "./tools/index.js";
import { getSettings } from "./settings.js";
import { esc, looksLikeUrl, md } from "./util.js";
import { initSuggest } from "./suggest.js";
import { initShortcuts } from "./shortcuts.js";
import { initWallpaper } from "./wallpaper.js";
import { startOrb } from "./orb.js";

const $ = (s) => document.querySelector(s);
const input = $("#cmd"), logEl = $("#log"), micBtn = $("#mic"), modeBtn = $("#mode");

const PRESETS = [
  { name: "Cobalt", h: 195, bg1: "#0b1a22", bg2: "#03080b" },
  { name: "Moss",   h: 95,  bg1: "#1e2b19", bg2: "#070c06" },
  { name: "Ember",  h: 28,  bg1: "#2b1810", bg2: "#0c0605" },
  { name: "Violet", h: 265, bg1: "#1e1631", bg2: "#07050d" },
  { name: "Rose",   h: 335, bg1: "#2b1020", bg2: "#0c050a" },
];
const STATES = {
  idle:      { spin: 0.0035, ring: 0.0016, off: 0,   hint: "Ask Jarvis or type a URL" },
  listening: { spin: 0.006,  ring: 0.003,  off: -40, hint: "Listening..." },
  thinking:  { spin: 0.016,  ring: 0.012,  off: 18,  hint: "Thinking..." },
  speaking:  { spin: 0.007,  ring: 0.004,  off: 0,   hint: "Speaking... (Esc to stop)" },
};

let state = "idle", amp = 0, port = null, rec = null, mode = "jarvis", thinkEl = null;
let baseHue = 195, theme = { preset: 0, h: null }, lastAccent = -1;
const suggest = initSuggest({
  input, box: $("#suggest"), getMode: () => mode,
  ask: (q) => send(q), search: (q) => chrome.search.query({ text: q, disposition: "CURRENT_TAB" }), go: (u) => go(u),
});

/* ---------------- theme + customize panel ---------------- */
function applyTheme() {
  const pr = PRESETS[theme.preset] || PRESETS[0];
  baseHue = theme.h ?? pr.h;
  if (baseHue !== lastAccent) { lastAccent = baseHue; chrome.storage.local.set({ accentHue: baseHue }); }
  const st = document.documentElement.style;
  st.setProperty("--h", baseHue); st.setProperty("--bg1", pr.bg1); st.setProperty("--bg2", pr.bg2);
  $("#hue").value = baseHue;
  document.querySelectorAll("#swatches button").forEach((b, i) => b.classList.toggle("on", i === theme.preset));
}
PRESETS.forEach((p, i) => {
  const b = document.createElement("button");
  b.title = p.name; b.style.background = `hsl(${p.h} 80% 50%)`;
  b.onclick = () => { theme = { preset: i, h: null }; applyTheme(); chrome.storage.local.set({ theme }); };
  $("#swatches").appendChild(b);
});
$("#hue").oninput = (e) => { theme.h = +e.target.value; applyTheme(); chrome.storage.local.set({ theme }); };
$("#edit").onclick = () => ($("#panel").hidden = !$("#panel").hidden);
$("#fullSettings").onclick = () => chrome.runtime.openOptionsPage();
$("#avatar").onclick = () => chrome.runtime.openOptionsPage();
$("#status").onclick = () => chrome.runtime.openOptionsPage();
$("#optShortcuts").onchange = (e) => { $("#shortcuts").hidden = !e.target.checked; chrome.storage.local.set({ showShortcuts: e.target.checked }); };
$("#optSuggest").onchange = (e) => chrome.storage.local.set({ webSuggest: e.target.checked });
$("#optSpeak").onchange = (e) => chrome.storage.local.set({ speak: e.target.checked });

async function loadPrefs() {
  const p = await chrome.storage.local.get({ theme: { preset: 0, h: null }, showShortcuts: true, speak: true, webSuggest: true });
  theme = p.theme; applyTheme();
  $("#optShortcuts").checked = p.showShortcuts; $("#shortcuts").hidden = !p.showShortcuts; $("#optSpeak").checked = p.speak; $("#optSuggest").checked = p.webSuggest;
}
async function refreshStatus() {
  const s = await getSettings(), el = $("#status");
  if (!s.apiKey) { el.className = "pill warn"; el.textContent = "Add your Groq API key to wake Jarvis"; return; }
  el.className = "pill";
  el.textContent = `${s.model}  \u00b7  ${tools.filter((t) => !s.disabledTools.includes(t.name) && (t.level !== "balanced" || s.privacy === "balanced")).length} tools  \u00b7  ${s.privacy} privacy`;
}
chrome.storage.onChanged.addListener(refreshStatus);

/* ---------------- state ---------------- */
function setState(s) {
  state = s;
  input.placeholder = mode === "web" && s === "idle" ? "Search Google or type a URL" : STATES[s].hint;
}
function setMode(m) {
  mode = m; modeBtn.querySelector("span").textContent = m === "jarvis" ? "Jarvis" : "Web";
  setState(state); suggest.refresh();
}
modeBtn.onclick = () => setMode(mode === "jarvis" ? "web" : "jarvis");

/* ---------------- conversation rendering ---------------- */
function add(cls, html, isText) {
  const d = document.createElement("div"); d.className = "msg " + cls;
  if (isText) d.textContent = html; else d.innerHTML = html;
  logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; return d;
}
function showThinking() { thinkEl = add("ai dots", "<span></span><span></span><span></span>"); }
function clearThinking() { thinkEl?.remove(); thinkEl = null; }

/* ---------------- talking to the service worker (shared conversation) ---------------- */
let iAsked = false; const confirmEls = new Map();
function ensurePort() {
  if (port) return port;
  port = chrome.runtime.connect({ name: "jarvis" });
  port.onMessage.addListener(onMsg);
  port.onDisconnect.addListener(() => { port = null; });
  port.postMessage({ type: "hello" });
  return port;
}
function renderEntry(e) {
  if (e.k === "user") { document.body.classList.replace("home", "chat"); add("user", e.text, true); }
  else if (e.k === "ai") add("ai", md(e.text));
  else if (e.k === "err") add("err", e.text, true);
  else if (e.k === "tool") { const d = add("", ""); const t = document.createElement("span"); t.className = "tool"; t.textContent = e.text; d.appendChild(t); }
}
function onMsg(m) {
  if (m.type === "sync") {
    logEl.innerHTML = ""; confirmEls.clear(); thinkEl = null;
    document.body.classList.toggle("chat", m.log.length > 0); document.body.classList.toggle("home", m.log.length === 0);
    m.log.forEach(renderEntry); if (m.busy) { setState("thinking"); showThinking(); }
  } else if (m.type === "log") {
    clearThinking(); renderEntry(m.entry);
    if (m.entry.k === "tool") showThinking();
    if (m.entry.k === "ai" && iAsked) { iAsked = false; chrome.storage.local.get({ speak: true }).then(({ speak }) => speak && say(m.entry.text)); }
    if (m.entry.k === "err") iAsked = false;
  } else if (m.type === "state") {
    if (m.state === "thinking") { if (state === "idle") setState("thinking"); if (!thinkEl) showThinking(); }
    else { clearThinking(); if (state === "thinking") setState("idle"); }
  } else if (m.type === "confirm") {
    clearThinking();
    const d = add("confirm", ""); d.className = "confirm"; d.append(document.createTextNode(m.text + " "));
    for (const [label, ok] of [["Allow", true], ["Deny", false]]) {
      const b = document.createElement("button"); b.textContent = label;
      b.onclick = () => port?.postMessage({ type: "confirm_reply", id: m.id, ok });
      d.appendChild(b);
    }
    confirmEls.set(m.id, d);
  } else if (m.type === "confirm_done") { confirmEls.get(m.id)?.remove(); confirmEls.delete(m.id); showThinking(); }
}
function send(text) { iAsked = true; ensurePort().postMessage({ type: "chat", text }); }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (port) port.postMessage({ type: "hello" }); else ensurePort(); } });

/* ---------------- search bar behaviour ---------------- */
function go(t) { chrome.tabs.update({ url: /^[a-z]+:\/\//i.test(t) ? t : "https://" + t }); }
function submit(opposite) {
  const t = input.value.trim(); if (!t) return;
  input.value = "";
  if (looksLikeUrl(t)) return go(t);
  const m = opposite ? (mode === "jarvis" ? "web" : "jarvis") : mode;
  if (m === "web") chrome.search.query({ text: t, disposition: "CURRENT_TAB" }); else send(t);
}
input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(e.shiftKey); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { speechSynthesis.cancel(); if (state === "speaking") setState("idle"); $("#panel").hidden = true; }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== input && document.activeElement?.tagName !== "INPUT") input.focus();
});
document.querySelectorAll(".card").forEach((c) => (c.onclick = () => send(c.dataset.prompt)));
$("#newchat").onclick = () => { ensurePort().postMessage({ type: "reset" }); speechSynthesis.cancel(); setState("idle"); input.focus(); };

/* ---------------- voice ---------------- */
function say(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, "link").replace(/[*`#]/g, ""));
  u.onstart = () => setState("speaking"); u.onend = u.onerror = () => setState("idle");
  speechSynthesis.speak(u);
}
async function transcribe(blob) {
  const { apiKey } = await chrome.storage.local.get({ apiKey: "" });
  if (!apiKey) { document.body.classList.replace("home", "chat"); add("err", "Add your Groq API key in settings first.", true); return setState("idle"); }
  const fd = new FormData(); fd.append("file", blob, "audio.webm"); fd.append("model", "whisper-large-v3-turbo");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  if (!r.ok) { document.body.classList.replace("home", "chat"); add("err", `Transcription failed (${r.status}).`, true); return setState("idle"); }
  const text = ((await r.json()).text || "").trim();
  if (text) send(text); else setState("idle");
}
async function toggleMic() {
  if (rec) { rec.stop(); return; }
  try {
    speechSynthesis.cancel();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(), an = ctx.createAnalyser(), buf = new Uint8Array(an.fftSize);
    ctx.createMediaStreamSource(stream).connect(an);
    const chunks = []; rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const meter = setInterval(() => { an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); amp = Math.min(1, mx / 55); }, 50);
    rec.onstop = () => {
      clearInterval(meter); amp = 0; stream.getTracks().forEach((t) => t.stop()); ctx.close();
      micBtn.classList.remove("rec"); rec = null; setState("thinking");
      transcribe(new Blob(chunks, { type: "audio/webm" })).catch((e) => { add("err", String(e), true); setState("idle"); });
    };
    rec.start(); micBtn.classList.add("rec"); setState("listening");
  } catch (e) { document.body.classList.replace("home", "chat"); add("err", "Microphone unavailable: " + e.message, true); }
}
micBtn.onclick = toggleMic;
$("#orb").onclick = toggleMic;

startOrb($("#orb"), { get state() { return state; }, get amp() { return amp; }, get hue() { return baseHue; } });

ensurePort(); loadPrefs(); refreshStatus(); initShortcuts(); initWallpaper(); setState("idle"); input.focus();
