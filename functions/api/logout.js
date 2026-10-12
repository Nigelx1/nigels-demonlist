// GET or POST /api/logout - forget the session, back to /admin/.
// (The cookie is the whole session; there's nothing to revoke server-side.)

import { redirect } from "../_lib/http.js";
import { clearModHintCookie, clearSessionCookie } from "../_lib/session.js";

export function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }
  return redirect(request, "/admin/", [clearSessionCookie(), clearModHintCookie()]);
}
