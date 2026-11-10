const $ = (s) => document.querySelector(s);

export async function initWallpaper() {
  const wall = $("#wall"), tint = $("#tint"), msg = $("#wallMsg");
  let w = { type: "none", tint: 0.4, blur: 0 };
  const s = await chrome.storage.local.get({ wallpaper: w, wallpaperData: null });
  w = { ...w, ...s.wallpaper }; let data = s.wallpaperData;
  if (w.type === "image" && !data) w.type = "none";

  const save = () => chrome.storage.local.set({ wallpaper: w });
  function apply() {
    wall.className = "wall w-" + w.type;
    wall.style.backgroundImage = w.type === "image" && data ? `url("${data}")` : "";
    wall.style.filter = w.type === "image" && w.blur ? `blur(${w.blur}px)` : "";
    tint.style.opacity = w.type === "none" ? 0 : w.tint;
    document.querySelectorAll("#wallSeg button").forEach((b) => b.classList.toggle("on", b.dataset.wall === w.type));
    $("#tintR").value = Math.round(w.tint * 100); $("#blurR").value = w.blur; $("#blurR").disabled = w.type !== "image";
  }

  async function fromFile(file) {
    const url = URL.createObjectURL(file), img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    let q = 0.86, out = c.toDataURL("image/jpeg", q);
    while (out.length > 6e6 && q > 0.4) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
    return out;
  }
  async function pick(file) {
    msg.textContent = "";
    try {
      data = await fromFile(file);
      await chrome.storage.local.set({ wallpaperData: data });
      w.type = "image"; if (w.tint < 0.15) w.tint = 0.4; save(); apply();
    } catch (e) { msg.textContent = "Couldn't use that image: " + (e.message || e); }
  }

  document.querySelectorAll("#wallSeg button").forEach((b) => (b.onclick = () => {
    const t = b.dataset.wall;
    if (t === "image" && !data) return $("#file").click();
    w.type = t; save(); apply();
  }));
  $("#upload").onclick = () => $("#file").click();
  $("#file").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) pick(f); };
  $("#tintR").oninput = (e) => { w.tint = +e.target.value / 100; apply(); };
  $("#tintR").onchange = save;
  $("#blurR").oninput = (e) => { w.blur = +e.target.value; apply(); };
  $("#blurR").onchange = save;
  apply();
}
