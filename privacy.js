// Everything that leaves the browser toward the model goes through scrub().
// Private values are swapped for placeholders ([EMAIL_1]...). The mapping stays local
// (in the extension's session storage) and restore() puts the real values back in what you see.
const KINDS = "EMAIL|PHONE|CARD|ID|ACCOUNT|IP|SECRET|NUMBER|URLPARAMS";
const TOKEN_RE = new RegExp(`\\[(?:${KINDS})_\\d+\\]`, "g");

const luhn = (digits) => {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = +digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
  return sum % 10 === 0;
};

export function createRedactor(state) {
  state.map ||= {}; state.n ||= {};
  const tag = (kind, value) => {
    for (const [k, v] of Object.entries(state.map)) if (v === value && k.startsWith(`[${kind}_`)) return k;
    const t = `[${kind}_${(state.n[kind] = (state.n[kind] || 0) + 1)}]`; state.map[t] = value; return t;
  };

  function scrub(text) {
    if (typeof text !== "string" || !text) return text;
    let s = text;
    // URLs: keep origin + path, tokenise the query string / fragment / credentials
    s = s.replace(/\bhttps?:\/\/[^\s"'<>)\]]+/gi, (m) => {
      try {
        const u = new URL(m), extra = (u.search || "") + (u.hash || "");
        const base = u.origin + (u.pathname === "/" ? "" : u.pathname);
        return extra ? `${base}${tag("URLPARAMS", extra)}` : base;
      } catch { return tag("SECRET", m); }
    });
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, (m) => tag("EMAIL", m));
    s = s.replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}\b/g, (m) => tag("SECRET", m));
    s = s.replace(/\b(?:sk|gsk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|ASIA|AIza|ya29)[-_A-Za-z0-9.]{12,}/g, (m) => tag("SECRET", m));
    s = s.replace(/\b(password|passwd|pwd|passcode|pin|otp|cvv|secret)\b(\s*(?:is|=|:)\s*)(\S+)/gi, (_, a, b, c) => a + b + (TOKEN_RE.test(c) ? c : tag("SECRET", c)));
    s = s.replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}\b/g, (m) => tag("SECRET", m));
    s = s.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d) ? tag("CARD", m.trim()) : m; });
    s = s.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (m) => tag("ID", m));
    s = s.replace(/\b\d{4}\s\d{4}\s\d{4}\b/g, (m) => tag("ID", m));
    s = s.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, (m) => tag("ID", m));
    s = s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => tag("ACCOUNT", m));
    s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => tag("IP", m));
    s = s.replace(/(?<![\w\[])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}(?![\w\]])/g, (m) => { const n = m.replace(/\D/g, "").length; return n >= 9 && n <= 15 ? tag("PHONE", m.trim()) : m; });
    s = s.replace(/(?<![\w\[])\d{10,}(?![\w\]])/g, (m) => tag("NUMBER", m));
    return s;
  }
  const restore = (text) => (typeof text === "string" ? text.replace(TOKEN_RE, (t) => state.map[t] ?? t) : text);
  const mapDeep = (v, fn) => (typeof v === "string" ? fn(v) : Array.isArray(v) ? v.map((x) => mapDeep(x, fn)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapDeep(x, fn)])) : v);
  return { scrub, restore, restoreDeep: (v) => mapDeep(v, restore) };
}
