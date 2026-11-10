import { favicon, hostOf, normalizeUrl } from "./util.js";
const MAX = 10, $ = (s) => document.querySelector(s);
const DOTS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>';

export async function initShortcuts() {
  const box = $("#shortcuts"), menu = $("#scMenu"), dlg = $("#scDialog");
  let mode = "top", custom = [], top = [], editing = null, dragIdx = -1;

  const s = await chrome.storage.local.get({ scMode: "top", scList: [] });
  mode = s.scMode; custom = s.scList;
  try { top = (await chrome.topSites.get()).slice(0, MAX).map((x) => ({ title: x.title, url: x.url })); } catch {}

  const current = () => (mode === "custom" ? custom : top);
  const save = () => chrome.storage.local.set({ scMode: mode, scList: custom });
  const syncSeg = () => document.querySelectorAll("#scSeg button").forEach((b) => b.classList.toggle("on", b.dataset.sc === mode));
  function ensureCustom() { if (mode !== "custom") { custom = top.map((x) => ({ ...x })); mode = "custom"; syncSeg(); } }
  const label = (x) => (x.title && (mode === "custom" || x.title.length <= 16) ? x.title : hostOf(x.url));

  function tile(x, i) {
    const a = document.createElement("a"); a.className = "sc"; a.href = x.url; a.draggable = true;
    const t = document.createElement("span"); t.className = "tile";
    const img = document.createElement("img"); img.src = favicon(x.url, 32);
    img.onerror = () => { t.textContent = (label(x)[0] || "?").toUpperCase(); t.classList.add("letter"); };
    t.appendChild(img);
    const l = document.createElement("span"); l.className = "lbl"; l.textContent = label(x);
    const more = document.createElement("button"); more.className = "more"; more.innerHTML = DOTS; more.title = "More actions";
    more.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openMenu(i, more); };
    a.append(t, l, more);
    a.ondragstart = (e) => { dragIdx = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", x.url); };
    a.ondragover = (e) => { if (dragIdx >= 0) { e.preventDefault(); a.classList.add("dragover"); } };
    a.ondragleave = () => a.classList.remove("dragover");
    a.ondrop = (e) => {
      e.preventDefault(); a.classList.remove("dragover");
      if (dragIdx < 0 || dragIdx === i) return;
      ensureCustom(); const [it] = custom.splice(dragIdx, 1); custom.splice(i, 0, it); dragIdx = -1; save(); render();
    };
    a.ondragend = () => { dragIdx = -1; };
    return a;
  }
  function addTile() {
    const b = document.createElement("button"); b.className = "sc addsc";
    b.innerHTML = `<span class="tile add">${PLUS}</span><span class="lbl">Add shortcut</span>`;
    b.onclick = () => openDialog(null); return b;
  }
  function render() {
    box.replaceChildren(...current().map(tile));
    if (current().length < MAX) box.appendChild(addTile());
  }

  function openMenu(i, anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.min(r.left, innerWidth - 170) + "px"; menu.style.top = r.bottom + 4 + "px"; menu.hidden = false;
    menu.querySelector('[data-act="edit"]').onclick = () => { menu.hidden = true; openDialog(i); };
    menu.querySelector('[data-act="remove"]').onclick = () => { menu.hidden = true; ensureCustom(); custom.splice(i, 1); save(); render(); };
  }
  document.addEventListener("click", () => (menu.hidden = true));

  function openDialog(i) {
    editing = i; const x = i == null ? { title: "", url: "" } : current()[i];
    $("#scHead").textContent = i == null ? "Add shortcut" : "Edit shortcut";
    $("#scName").value = x.title || ""; $("#scUrl").value = x.url || ""; $("#scUrl").setCustomValidity("");
    dlg.showModal(); $("#scName").focus();
  }
  $("#scCancel").onclick = () => dlg.close();
  $("#scForm").onsubmit = (e) => {
    e.preventDefault();
    const raw = $("#scUrl").value.trim(); let url;
    try { url = new URL(normalizeUrl(raw)).href; } catch { $("#scUrl").setCustomValidity("Enter a valid URL"); $("#scUrl").reportValidity(); return; }
    const item = { title: $("#scName").value.trim() || hostOf(url), url };
    ensureCustom();
    if (editing == null) custom.push(item); else custom[editing] = item;
    save(); render(); dlg.close();
  };
  $("#scUrl").oninput = () => $("#scUrl").setCustomValidity("");

  document.querySelectorAll("#scSeg button").forEach((b) => (b.onclick = () => {
    mode = b.dataset.sc; if (mode === "custom" && !custom.length) custom = top.map((x) => ({ ...x }));
    syncSeg(); save(); render();
  }));
  syncSeg(); render();
}
