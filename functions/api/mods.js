// GET /api/mods - the mod team, for the Mods panel on the mod page: {mods: [{id,
// name, role}]} as functions/editors.json has it in this deploy. Nigel only: he
// alone changes the team (set_mod / remove_mod), so nobody else needs the ids.
// 401 when logged out, 403 for anyone else.

import { json, jsonError, missingEnv, notSetUp } from "../_lib/http.js";
import { allEditors, currentEditor } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const missing = missingEnv(env, ["SESSION_SECRET"]);
  if (missing) return notSetUp(missing);
  const ed = await currentEditor(request, env);
  if (!ed) return jsonError(401, "not logged in");
  if (!ed.owner) return jsonError(403, "only Nigel can see the mod team here");
  return json({ mods: allEditors() });
}
