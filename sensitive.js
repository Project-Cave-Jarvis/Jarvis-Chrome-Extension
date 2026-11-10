// Sites where Jarvis hides itself and where tab titles are never exposed.
export const DEFAULT_PRIVATE = [
  "mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com", "proton.me", "mail.proton.me",
  "web.whatsapp.com", "web.telegram.org", "messenger.com", "discord.com", "paypal.com", "1password.com", "my.1password.com",
  "bitwarden.com", "vault.bitwarden.com", "lastpass.com", "accounts.google.com", "myaccount.google.com", "login.microsoftonline.com",
  "appleid.apple.com", "signin.aws.amazon.com", "irs.gov", "healthcare.gov",
];
const HOST_RE = /(^|[.-])(bank|banking|netbanking|wallet|health|patient|medical|hospital|insurance|payroll|vault|login|signin|sso)([.-]|$)|bank/i;
const PATH_RE = /\/(login|log-in|signin|sign-in|checkout|payment|payments|billing|password|oauth|2fa|verify)(\/|$|\?)/i;

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }

export function isPrivate(url, userList = []) {
  let u; try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.replace(/^www\./, "").toLowerCase();
  for (const d of [...DEFAULT_PRIVATE, ...userList.map((x) => x.trim().toLowerCase()).filter(Boolean)]) if (h === d || h.endsWith("." + d)) return true;
  return HOST_RE.test(h) || PATH_RE.test(u.pathname + "/");
}
