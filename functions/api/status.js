// GET /api/status - how the recent edits went (newest first):
//   [{requestId, editor, status, conclusion, createdAt, url}, ...]
// GET /api/status?requestId=<16 hex> - one edit:
//   {run: null}                    GitHub hasn't started it yet (or it's too old)
//   {run: {..., reason}}           reason = why it was refused, when it failed
//
// status is GitHub's: queued, in_progress, completed (also waiting, pending).
// conclusion, once completed: success (applied, or nothing to change), failure
// (refused or broke), cancelled, timed_out. url is the run's page on GitHub.

import { json, jsonError, missingEnv, notSetUp } from "../_lib/http.js";
import { currentEditor } from "../_lib/session.js";
import { listRuns, refusalReason, GitHubError } from "../_lib/github.js";

export async function onRequestGet({ request, env }) {
  const missing = missingEnv(env, ["SESSION_SECRET", "GITHUB_TOKEN"]);
  if (missing) return notSetUp(missing);
  if (!(await currentEditor(request, env))) return jsonError(401, "not logged in");
  const want = new URL(request.url).searchParams.get("requestId");
  if (want !== null && !/^[0-9a-f]{16}$/.test(want)) return jsonError(400, "requestId must be 16 lowercase hex characters");
  try {
    if (want === null) return json((await listRuns(env, 15)).map(([, info]) => info));
    const hit = (await listRuns(env, 50)).find(([, info]) => info.requestId === want);
    if (!hit) return json({ run: null });
    const [run, info] = hit;
    info.reason = info.conclusion === "failure" ? await refusalReason(env, run) : null;
    return json({ run: info });
  } catch (e) {
    if (e instanceof GitHubError) return jsonError(502, e.message);
    throw e;
  }
}
