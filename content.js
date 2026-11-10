// Jarvis presence. This script only draws a floating orb and an iframe pointing at the extension's own panel.
// It NEVER reads the page: no DOM text, no forms, no screenshots, no URLs. Whether to show is decided in the background.
(() => {
  if (window.top !== window || window.__jarvisPresence) return;
  window.__jarvisPresence = true;
  let host, root, orb, panel, frame, bubble, bubbleTimer;
  let pos = { right: 22, bottom: 22 }, hue = 195, open = false;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const CSS = `
  *{box-sizing:border-box;font-family:"Segoe UI",system-ui,sans-serif}
  [hidden]{display:none!important}
  .orb{position:fixed;right:var(--r);bottom:var(--b);width:56px;height:56px;border-radius:50%;padding:0;cursor:grab;pointer-events:auto;touch-action:none;
    border:1px solid hsl(var(--h) 90% 65% / .55);
    background:radial-gradient(circle at 38% 34%,hsl(var(--h) 100% 92%) 0 5%,hsl(var(--h) 100% 62% / .95) 24%,hsl(var(--h) 90% 28% / .92) 62%,hsl(var(--h) 80% 10%) 100%);
    box-shadow:0 0 24px hsl(var(--h) 100% 55% / .5),0 8px 22px rgba(0,0,0,.45);animation:breathe 4.5s ease-in-out infinite}
  .orb:active{cursor:grabbing}
  .orb::before{content:"";position:absolute;inset:-8px;border-radius:50%;border:1.5px dashed hsl(var(--h) 100% 70% / .5);animation:spin 16s linear infinite}
  .orb::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:1px solid transparent;border-top-color:hsl(var(--h) 100% 75% / .75);animation:spin 7s linear infinite reverse}
  .orb.thinking::before{animation-duration:1.6s;border-style:solid} .orb.thinking::after{animation-duration:.9s}
  .orb.attn{animation:attn 1.1s ease-in-out infinite}
  @keyframes breathe{50%{box-shadow:0 0 34px hsl(var(--h) 100% 55% / .75),0 8px 22px rgba(0,0,0,.45);transform:scale(1.04)}}
  @keyframes spin{to{transform:rotate(360deg)}} @keyframes attn{50%{transform:scale(1.15)}} @keyframes pop{from{opacity:0;transform:translateY(6px)}}
  .panel{position:fixed;width:380px;max-width:calc(100vw - 16px);border-radius:20px;overflow:hidden;pointer-events:auto;background:#050d11;
    box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px hsl(var(--h) 60% 50% / .35)}
  .panel iframe{width:100%;height:100%;border:0;display:block}
  .bubble{position:fixed;right:calc(var(--r) + 72px);bottom:calc(var(--b) + 8px);max-width:260px;padding:12px 14px;border-radius:14px 14px 4px 14px;pointer-events:auto;
    background:rgba(6,16,20,.95);color:#e6f4f8;font-size:13px;line-height:1.45;border:1px solid hsl(var(--h) 60% 50% / .45);box-shadow:0 10px 30px rgba(0,0,0,.45);animation:pop .25s ease}
  .bubble button{margin:8px 8px 0 0;padding:4px 12px;border-radius:999px;border:1px solid hsl(var(--h) 90% 62%);background:transparent;color:inherit;font-size:12px;cursor:pointer}`;

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  function applyPos() {
    if (!host) return;
    host.style.setProperty("--r", pos.right + "px"); host.style.setProperty("--b", pos.bottom + "px"); host.style.setProperty("--h", hue);
    const ph = Math.min(560, innerHeight - 100), above = pos.bottom + 68 + ph < innerHeight;
    panel.style.height = ph + "px"; panel.style.right = clamp(pos.right, 8, Math.max(8, innerWidth - 388)) + "px";
    panel.style.bottom = above ? pos.bottom + 68 + "px" : "auto"; panel.style.top = above ? "auto" : Math.max(8, innerHeight - pos.bottom + 12) + "px";
  }

  function build() {
    host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    root = host.attachShadow({ mode: "closed" });
    const st = el("style"); st.textContent = CSS;
    panel = el("div", "panel"); panel.hidden = true;
    bubble = el("div", "bubble"); bubble.hidden = true;
    orb = el("button", "orb"); orb.setAttribute("aria-label", "Jarvis");
    root.append(st, panel, bubble, orb);
    document.documentElement.appendChild(host);
    applyPos();

    let down = false, dragging = false, sx = 0, sy = 0, sr = 0, sb = 0;
    orb.addEventListener("pointerdown", (e) => { down = true; dragging = false; sx = e.clientX; sy = e.clientY; sr = pos.right; sb = pos.bottom; orb.setPointerCapture(e.pointerId); });
    orb.addEventListener("pointermove", (e) => {
      if (!down) return; const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true; pos.right = clamp(sr - dx, 8, innerWidth - 64); pos.bottom = clamp(sb - dy, 8, innerHeight - 64); applyPos();
    });
    orb.addEventListener("pointerup", (e) => {
      down = false; try { orb.releasePointerCapture(e.pointerId); } catch {}
      if (dragging) { dragging = false; chrome.storage.local.set({ presencePos: pos }); } else toggle();
    });
  }
  function remove() { clearTimeout(bubbleTimer); host?.remove(); host = root = orb = panel = frame = bubble = null; open = false; }

  function openPanel() {
    if (!host) return; hideBubble(); orb.classList.remove("attn");
    if (!frame) { frame = el("iframe"); frame.src = chrome.runtime.getURL("panel.html"); frame.setAttribute("allow", "microphone"); panel.appendChild(frame); }
    applyPos(); panel.hidden = false; open = true;
  }
  function closePanel() { if (!host) return; panel.hidden = true; frame?.remove(); frame = null; open = false; }
  const toggle = () => (open ? closePanel() : openPanel());

  function hideBubble() { clearTimeout(bubbleTimer); if (bubble) bubble.hidden = true; }
  function showBubble(text, preset) {
    bubble.replaceChildren(); bubble.append(document.createTextNode(text), el("br"));
    const go = el("button"); go.textContent = preset ? "Do it" : "OK";
    go.onclick = () => { openPanel(); if (preset) chrome.runtime.sendMessage({ type: "preset", preset }); };
    const no = el("button"); no.textContent = "Not now"; no.onclick = () => { hideBubble(); orb.classList.remove("attn"); };
    bubble.append(go, no); bubble.hidden = false; orb.classList.add("attn");
    bubbleTimer = setTimeout(() => { hideBubble(); orb?.classList.remove("attn"); }, 20000);
  }

  async function init() {
    if (host) return;
    const r = await chrome.runtime.sendMessage({ type: "presence-check" }).catch(() => null);
    if (!r || !r.show || host) return;
    const s = await chrome.storage.local.get({ presencePos: pos, accentHue: 195 });
    pos = s.presencePos; hue = s.accentHue; build();
  }
  async function recheck() {
    const r = await chrome.runtime.sendMessage({ type: "presence-check" }).catch(() => null);
    if (!r || !r.show) remove(); else if (!host) init();
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "toggle") { host ? toggle() : init().then(() => host && openPanel()); }
    else if (m.type === "state") orb?.classList.toggle("thinking", m.state === "thinking");
    else if (m.type === "nudge") host && showBubble(m.text, m.preset);
    else if (m.type === "close") closePanel();
    else if (m.type === "hide") remove();
    else if (m.type === "recheck") recheck();
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.accentHue) { hue = c.accentHue.newValue; applyPos(); }
    if (c.presence || c.hiddenSites || c.hideOnPrivate || c.privateSites) recheck();
  });
  addEventListener("resize", applyPos);
  init();
})();
