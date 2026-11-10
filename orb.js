const CFG = {
  idle:      { spin: 0.0035, ring: 0.0016, off: 0 },
  listening: { spin: 0.006,  ring: 0.003,  off: -40 },
  thinking:  { spin: 0.016,  ring: 0.012,  off: 18 },
  speaking:  { spin: 0.007,  ring: 0.004,  off: 0 },
};
// ctx supplies { state, amp, hue } as live getters.
export function startOrb(cv, ctx, opt = {}) {
  const g = cv.getContext("2d");
const M = opt.particles || 640, pts = [];
for (let i = 0; i < M; i++) { const y = 1 - (2 * (i + 0.5)) / M, r = Math.sqrt(1 - y * y), th = i * 2.399963; pts.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
let rot = 0, ringRot = 0, pulse = 0, hueCur = 195, ripples = [], lastRip = 0;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function frame(t) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(cv.clientWidth * dpr);
  if (w && cv.width !== w) { cv.width = w; cv.height = w; }
  if (!cv.width) return requestAnimationFrame(frame);
  g.setTransform(cv.width / 600, 0, 0, cv.width / 600, 0, 0);
  g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, 600, 600);

  const cfg = CFG[ctx.state];
  hueCur += (ctx.hue + cfg.off - hueCur) * 0.06; const h = hueCur;
  const target = ctx.state === "listening" ? ctx.amp : ctx.state === "speaking" ? 0.4 + 0.35 * Math.sin(t / 110) * Math.sin(t / 290)
    : ctx.state === "thinking" ? 0.25 + 0.1 * Math.sin(t / 160) : 0.06 + 0.04 * Math.sin(t / 1200);
  pulse += (target - pulse) * 0.18; rot += cfg.spin; ringRot += cfg.ring;
  const R = 140 * (1 + pulse * 0.07);
  g.globalCompositeOperation = "lighter";

  let gr = g.createRadialGradient(300, 300, R * 0.2, 300, 300, 295);
  gr.addColorStop(0, hsl(h, 100, 55, 0.22 + pulse * 0.25)); gr.addColorStop(0.45, hsl(h, 100, 45, 0.07)); gr.addColorStop(1, hsl(h, 100, 40, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 600, 600);
  gr = g.createRadialGradient(300, 300, 0, 300, 300, R);
  gr.addColorStop(0, hsl(h, 100, 92, 0.5 + pulse * 0.3)); gr.addColorStop(0.35, hsl(h, 100, 60, 0.2)); gr.addColorStop(1, hsl(h, 100, 50, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(300, 300, R, 0, 7); g.fill();

  // spinning great circles
  g.lineWidth = 1.2;
  for (let k = 0; k < 3; k++) {
    g.save(); g.translate(300, 300); g.rotate(ringRot * (k + 1) * 0.9 + k * 1.05);
    g.strokeStyle = hsl(h, 100, 70, 0.16 + pulse * 0.1);
    g.beginPath(); g.ellipse(0, 0, R * 1.02, R * 1.02 * (0.28 + 0.2 * Math.sin(rot * 2 + k)), 0, 0, 7); g.stroke(); g.restore();
  }
  // shimmering particle shell, brighter at the rim
  const cr = Math.cos(rot), sr = Math.sin(rot), tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (const [x, y, z] of pts) {
    const x1 = x * cr - z * sr, z1 = x * sr + z * cr, y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
    const n = Math.sin(x * 4 + t * 0.0011) + Math.sin(y * 5 - t * 0.0013) + Math.sin(z * 3.5 + t * 0.0009);
    const rr = R * (1 + n * 0.022 + pulse * 0.05), rim = 1 - Math.abs(z2), front = z2 > 0;
    g.fillStyle = hsl(h, 100, front ? 74 : 60, Math.min(1, (front ? 0.22 : 0.09) + Math.pow(rim, 2.2) * 0.7));
    const sz = 0.7 + (z2 * 0.5 + 0.5) * 1.3;
    g.fillRect(300 + x1 * rr - sz / 2, 300 + y2 * rr - sz / 2, sz, sz);
  }
  g.strokeStyle = hsl(h, 100, 70, 0.22 + pulse * 0.3); g.lineWidth = 1.5; g.beginPath(); g.arc(300, 300, R, 0, 7); g.stroke();

  // tick ring
  g.save(); g.translate(300, 300); g.rotate(ringRot);
  for (const long of [false, true]) {
    g.beginPath(); g.strokeStyle = hsl(h, 100, 70, long ? 0.55 : 0.22); g.lineWidth = long ? 1.8 : 1;
    for (let i = 0; i < 120; i++) {
      if ((i % 10 === 0) !== long) continue;
      const a = (i / 120) * Math.PI * 2, r2 = long ? 218 : 211;
      g.moveTo(Math.cos(a) * 203, Math.sin(a) * 203); g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    }
    g.stroke();
  }
  g.restore();
  // sweeping arcs
  g.lineWidth = 2.5; g.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    const a0 = -ringRot * 1.7 * (k % 2 ? -1 : 1) + k * 2.1, len = 0.5 + 0.35 * Math.sin(t / 900 + k);
    g.strokeStyle = hsl(h, 100, 68, 0.4 + 0.3 * pulse); g.beginPath(); g.arc(300, 300, 230 + k * 9, a0, a0 + len); g.stroke();
  }
  // orbiting nodes
  for (let k = 0; k < 4; k++) {
    const a = t / (2200 + k * 700) + k * 1.7, rx = 170 + k * 14, ry = rx * (0.35 + k * 0.12), tl = k * 0.8 + 0.4;
    const x0 = Math.cos(a) * rx, y0 = Math.sin(a) * ry;
    const x = 300 + x0 * Math.cos(tl) - y0 * Math.sin(tl), y = 300 + x0 * Math.sin(tl) + y0 * Math.cos(tl);
    g.fillStyle = hsl(h, 100, 70, 0.25); g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = hsl(h, 100, 88, 1); g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
  }
  // ripples while speaking or hearing loud audio
  if ((ctx.state === "speaking" && t - lastRip > 520) || (ctx.state === "listening" && ctx.amp > 0.35 && t - lastRip > 300)) { ripples.push(t); lastRip = t; }
  ripples = ripples.filter((b) => t - b < 1400);
  for (const b of ripples) {
    const age = (t - b) / 1400; g.strokeStyle = hsl(h, 100, 70, (1 - age) * 0.35); g.lineWidth = 1.5;
    g.beginPath(); g.arc(300, 300, R * (1.05 + age * 0.9), 0, 7); g.stroke();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
}
