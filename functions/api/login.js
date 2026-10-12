// GET /api/login - send the browser to Discord to log in.
//
// Scope "identify" only: we need the Discord user id (to look it up in
// functions/editors.json) and the username (so a stranger can be told what to
// send Nigel). The state value is random, and a signed copy rides along in a
// short-lived HttpOnly cookie; /api/callback refuses a login whose state
// doesn't match it, so nobody can finish a login someone else started.

import { missingEnv, notSetUp, randomHex } from "../_lib/http.js";
import { makeState, stateCookie } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const missing = missingEnv(env, ["DISCORD_CLIENT_ID", "SESSION_SECRET"]);
  if (missing) return notSetUp(missing, true);
  const state = randomHex(16);
  const q = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    scope: "identify",
    redirect_uri: new URL(request.url).origin + "/api/callback",
    state,
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: "https://discord.com/oauth2/authorize?" + q,
      "Set-Cookie": stateCookie(await makeState(env.SESSION_SECRET, state)),
      "Cache-Control": "no-store",
    },
  });
}
