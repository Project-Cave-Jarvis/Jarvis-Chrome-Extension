export const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const looksLikeUrl = (s) =>
  /^(https?:\/\/|chrome:\/\/|file:\/\/)\S+$/i.test(s) || /^(localhost(:\d+)?|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/.test(s);
export const normalizeUrl = (t) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : "https://" + t);
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
export function favicon(pageUrl, size = 32) {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl); u.searchParams.set("size", String(size));
  return u.toString();
}

export function md(s) {
  return esc(s).split("\n").filter((l) => l.trim()).map((l) => {
    const li = /^\s*[-*] /.test(l);
    const body = (li ? l.replace(/^\s*[-*] /, "") : l)
      .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(https?:\/\/[^\s<)&]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return `<div class="${li ? "li" : "ln"}">${body}</div>`;
  }).join("");
}
