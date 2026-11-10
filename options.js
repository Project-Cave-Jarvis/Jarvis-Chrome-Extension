import { tools } from "./tools/index.js";
import { getSettings, DEFAULT_PROMPT } from "./settings.js";
import { DEFAULT_PRIVATE } from "./sensitive.js";
const $ = (s) => document.querySelector(s);
const s = await getSettings();

function fillModels(list, selected) {
  const sel = $("#model"); sel.innerHTML = "";
  for (const id of new Set([selected, ...list])) sel.add(new Option(id, id, false, id === selected));
}
fillModels([], s.model);
$("#apiKey").value = s.apiKey; $("#systemPrompt").value = s.systemPrompt; $("#speak").checked = s.speak;
document.querySelector(`input[name=privacy][value=${s.privacy}]`).checked = true;
$("#presence").checked = s.presence; $("#hideOnPrivate").checked = s.hideOnPrivate; $("#nudges").checked = s.nudges;
$("#privateSites").value = s.privateSites.join("\n"); $("#hiddenSites").value = s.hiddenSites.join("\n");
$("#builtin").textContent = "Built in: " + DEFAULT_PRIVATE.join(", ") + ", plus any site with bank, health, login, checkout and similar in its name.";

for (const t of tools) {
  const d = document.createElement("div"); d.className = "tool";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.dataset.name = t.name; cb.checked = !s.disabledTools.includes(t.name);
  const box = document.createElement("div"), b = document.createElement("b"); b.textContent = t.name; box.appendChild(b);
  if (t.level === "balanced") { const g = document.createElement("span"); g.className = "badge"; g.textContent = "balanced only"; box.appendChild(g); }
  if (t.requiresConfirm) { const g = document.createElement("span"); g.className = "badge"; g.textContent = "asks first"; box.appendChild(g); }
  const sm = document.createElement("small"); sm.textContent = t.description; box.appendChild(sm);
  d.append(cb, box); $("#tools").appendChild(d);
}

$("#refresh").onclick = async () => {
  const key = $("#apiKey").value.trim(); if (!key) return ($("#status").textContent = "Enter your key first.");
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) return ($("#status").textContent = `Failed (${r.status})`);
  const ids = (await r.json()).data.map((m) => m.id).filter((id) => !/whisper|tts|guard|playai/i.test(id)).sort();
  fillModels(ids, $("#model").value); $("#status").textContent = `${ids.length} models loaded.`;
};
$("#resetPrompt").onclick = () => ($("#systemPrompt").value = DEFAULT_PROMPT);
const lines = (id) => $(id).value.split("\n").map((x) => x.trim().toLowerCase()).filter(Boolean);

async function showLast() {
  const { lastOutbound } = await chrome.storage.session.get("lastOutbound");
  $("#last").value = lastOutbound ? JSON.stringify(lastOutbound, null, 2) : "Nothing has been sent yet this session.";
}
$("#reloadLast").onclick = showLast; showLast();

$("#save").onclick = async () => {
  await chrome.storage.local.set({
    apiKey: $("#apiKey").value.trim(), model: $("#model").value, systemPrompt: $("#systemPrompt").value, speak: $("#speak").checked,
    privacy: document.querySelector("input[name=privacy]:checked").value,
    presence: $("#presence").checked, hideOnPrivate: $("#hideOnPrivate").checked, nudges: $("#nudges").checked,
    privateSites: lines("#privateSites"), hiddenSites: lines("#hiddenSites"),
    disabledTools: [...document.querySelectorAll("[data-name]")].filter((c) => !c.checked).map((c) => c.dataset.name),
  });
  $("#status").textContent = "Saved.";
};
