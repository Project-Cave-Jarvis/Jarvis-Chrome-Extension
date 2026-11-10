export async function startMic(onAmp) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext(), an = ctx.createAnalyser(), buf = new Uint8Array(an.fftSize);
  ctx.createMediaStreamSource(stream).connect(an);
  const chunks = [], rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => chunks.push(e.data);
  const meter = setInterval(() => { an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); onAmp(Math.min(1, mx / 55)); }, 50);
  rec.start();
  return { stop: () => new Promise((res) => { rec.onstop = () => { clearInterval(meter); onAmp(0); stream.getTracks().forEach((t) => t.stop()); ctx.close(); res(new Blob(chunks, { type: "audio/webm" })); }; rec.stop(); }) };
}
export async function transcribe(blob) {
  const { apiKey, apiBase } = await chrome.storage.local.get({ apiKey: "", apiBase: "" });
  if (!apiKey) throw new Error("Add your Groq API key in settings first.");
  const fd = new FormData(); fd.append("file", blob, "audio.webm"); fd.append("model", "whisper-large-v3-turbo");
  const r = await fetch(`${apiBase || "https://api.groq.com/openai/v1"}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  if (!r.ok) throw new Error(`Transcription failed (${r.status}).`);
  return ((await r.json()).text || "").trim();
}
export function speak(text, onStart, onEnd) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, "link").replace(/[*`#]/g, ""));
  u.onstart = onStart; u.onend = u.onerror = onEnd; speechSynthesis.speak(u);
}
