// POST /api/edit - send a batch of edits to the list.
//
// Body: {"ops": [1-10 ops]} as application/json (the contract is in
// functions/_lib/contract.js and tools/apply-edit.py). The ops are checked
// here so mistakes show up at once, then sent to GitHub as a
// repository_dispatch; .github/workflows/apply-edit.yml applies them, commits
// and pushes, and Cloudflare deploys. The editor's name always comes from the
// session (and editors.json), never from the request.
//
// Answers {requestId} (200) when GitHub has the edit - not when it's applied:
// follow it with GET /api/status?requestId=... Errors are {error} with
// 400 (bad edit), 401 (not logged in), 403 (another site), 413, 415,
// 502 (GitHub said no) or 503 (not set up).
//
// The Content-Type and Origin checks are the CSRF guard: another site's form
// can't send application/json, and a script on another site can't make the
// browser send this site's Origin.

import { json, jsonError, missingEnv, notSetUp, randomHex, sameOrigin } from "../_lib/http.js";
import { currentEditor } from "../_lib/session.js";
import { checkRole, Refuse, validateEditBody } from "../_lib/contract.js";
import { dispatchEdit, GitHubError } from "../_lib/github.js";

const MAX_BODY = 64 * 1024; // ten ops are a couple of KB

export async function onRequestPost({ request, env }) {
  const missing = missingEnv(env, ["SESSION_SECRET", "GITHUB_TOKEN"]);
  if (missing) return notSetUp(missing);
  const editor = await currentEditor(request, env);
  if (!editor) return jsonError(401, "not logged in");
  if (!sameOrigin(request)) return jsonError(403, "edits can only be sent from the mod page on this site");
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return jsonError(415, "send the edit as application/json");

  const text = await request.text();
  if (text.length > MAX_BODY) return jsonError(413, "that edit is too big");
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError(400, "the request isn't valid JSON");
  }
  let ops;
  try {
    ops = validateEditBody(body);
  } catch (e) {
    if (e instanceof Refuse) return jsonError(400, e.message);
    throw e;
  }
  // Head-only and Nigel-only edits (contract.js HEAD_ONLY, OWNER_ONLY). The role
  // comes from editors.json as it is now, so a change there counts at once.
  try {
    checkRole(ops, editor.role, editor.owner);
  } catch (e) {
    if (e instanceof Refuse) return jsonError(403, e.message);
    throw e;
  }

  const requestId = randomHex(8);
  const payload = { requestId, editor: editor.name, role: editor.role, ops };
  if (editor.owner) payload.owner = true; // the mod team edits (OWNER_ONLY); apply-edit.py checks it again
  try {
    await dispatchEdit(env, payload);
  } catch (e) {
    if (e instanceof GitHubError) return jsonError(502, e.message);
    throw e;
  }
  return json({ requestId });
}
