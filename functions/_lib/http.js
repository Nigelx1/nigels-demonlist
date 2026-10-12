// Response helpers shared by the mod page's API (functions/api/*).
//
// Everything here is answered with Cache-Control: no-store - these answers
// depend on who's logged in, and a cached /api/me or redirect would leak or
// replay a login.

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body, status = 200, extra = {}) {
  const headers = new Headers({ ...NO_STORE, "Content-Type": "application/json; charset=utf-8" });
  for (const [k, v] of Object.entries(extra)) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

export function jsonError(status, message, extra = {}) {
  return json({ error: message }, status, extra);
}

// A redirect to a path on this site, never anywhere else: the target is
// resolved against the request's own origin, and anything that resolves to
// another origin (//evil.com, https://..., /\evil.com) goes to /admin/ instead.
export function redirect(request, path, cookies = []) {
  const origin = new URL(request.url).origin;
  let target;
  try {
    target = new URL(path, origin);
  } catch {
    target = null;
  }
  if (!target || target.origin !== origin) target = new URL("/admin/", origin);
  const headers = new Headers({ ...NO_STORE, Location: target.pathname + target.search });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 303, headers });
}

// The page's own origin, which a same-site POST carries in its Origin header.
export function sameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// __Host- cookies must be Secure, Path=/ and have no Domain; browsers treat
// http://localhost as secure, so this also works under `wrangler pages dev`.
export function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// The Cloudflare Pages settings each endpoint needs. Returns the name of the
// first one that's missing (or too weak), or null when everything is there.
export function missingEnv(env, names) {
  for (const n of names) {
    const v = env && env[n];
    if (typeof v !== "string" || !v.trim()) return n;
    // the session key signs every login; a short one could be guessed offline
    if (n === "SESSION_SECRET" && v.length < 32) return "SESSION_SECRET (it needs at least 32 characters)";
  }
  return null;
}

export function notSetUp(missing, asText = false) {
  const msg = `the mod page isn't set up yet: ${missing} is missing from the Cloudflare Pages settings`;
  if (asText) {
    return new Response(msg + "\n", { status: 503, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return jsonError(503, msg);
}

export function randomHex(bytes) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
