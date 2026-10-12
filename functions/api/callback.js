// GET /api/callback - Discord sends the browser back here after the login.
//
// Checks the state against the cookie /api/login set, trades the code for a
// token, asks Discord who this is, and if their id is in functions/editors.json
// gives them a 7-day session. Everyone else goes back to /admin/ with their id
// and username in the address so the page can say "send Nigel this ID".
//
// Every outcome is a redirect to /admin/ on this site:
//   /admin/                       logged in
//   /admin/?denied=<id>&user=<u>  not an editor
//   /admin/?error=cancelled       they pressed Cancel on Discord
//   /admin/?error=expired         the state didn't match (too slow, or a stale tab)
//   /admin/?error=discord         Discord didn't answer as expected
//   /admin/?error=editor_name     their editors.json entry isn't a valid list name

import { missingEnv, notSetUp, readCookie, redirect } from "../_lib/http.js";
import {
  STATE_COOKIE, readState, clearStateCookie, makeSession, sessionCookie, modHintCookie, editorFor,
} from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const missing = missingEnv(env, ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "SESSION_SECRET"]);
  if (missing) return notSetUp(missing, true);
  const url = new URL(request.url);
  const clear = [clearStateCookie()]; // a state is good for one try only
  const fail = (code) => redirect(request, `/admin/?error=${code}`, clear);

  if (url.searchParams.get("error")) return fail("cancelled"); // e.g. access_denied
  const state = await readState(env.SESSION_SECRET, readCookie(request, STATE_COOKIE));
  if (!state || url.searchParams.get("state") !== state) return fail("expired");
  const code = url.searchParams.get("code");
  if (!code) return fail("discord");

  let user;
  try {
    const tr = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: url.origin + "/api/callback",
      }),
    });
    if (!tr.ok) {
      console.log(`discord token exchange: ${tr.status} ${(await tr.text()).slice(0, 300)}`);
      return fail("discord");
    }
    const token = await tr.json();
    if (typeof token.access_token !== "string") return fail("discord");
    const ur = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    });
    if (!ur.ok) {
      console.log(`discord users/@me: ${ur.status}`);
      return fail("discord");
    }
    user = await ur.json();
  } catch (e) {
    console.log(`discord login: ${e.message}`);
    return fail("discord");
  }
  if (!user || typeof user.id !== "string" || !/^\d{1,25}$/.test(user.id)) return fail("discord");

  const ed = editorFor(user.id);
  if (!ed) {
    const q = new URLSearchParams({ denied: user.id, user: String(user.username || "") });
    return redirect(request, `/admin/?${q}`, clear);
  }
  if (!ed.name) {
    console.log(ed.bad);
    return fail("editor_name");
  }
  const session = await makeSession(env.SESSION_SECRET, user.id, ed.name);
  return redirect(request, "/admin/", [...clear, sessionCookie(session), modHintCookie()]);
}
