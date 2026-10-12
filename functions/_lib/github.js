// The GitHub side of the mod page: start an edit (a repository_dispatch that
// .github/workflows/apply-edit.yml picks up) and read back how runs went.
//
// env.GITHUB_TOKEN is a fine-grained token for this one repo: Contents
// read/write (a dispatch needs write) and Actions read (the runs list).

// This site's repo and name: functions/site.json (the only per-site bits of the
// mod page besides editors.json, so these files are the same on every list).
import SITE from "../site.json";

export const REPO = SITE.repo;
export const WORKFLOW = "apply-edit.yml";
const API = "https://api.github.com";
// the workflow's run-name is "Edit <requestId> by <editor>"
const TITLE = /^Edit ([0-9a-f]{16}) by (.+)$/;

export class GitHubError extends Error {}

function headers(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${SITE.name.replace(/[^A-Za-z0-9]/g, "")}-ModPage`,
    ...extra,
  };
}

// What a GitHub status means for the person setting the site up.
function explain(status, what) {
  if (status === 401) return `GitHub didn't accept GITHUB_TOKEN while ${what} (401): it's wrong or has expired`;
  if (status === 403 || status === 404) {
    return `GITHUB_TOKEN isn't allowed to do this while ${what} (${status}): it needs access to ${REPO} with Contents read/write and Actions read`;
  }
  return `GitHub answered ${status} while ${what}`;
}

async function call(env, path, init, what) {
  let r;
  try {
    r = await fetch(API + path, { ...init, headers: headers(env, init.headers) });
  } catch (e) {
    throw new GitHubError(`couldn't reach GitHub while ${what}: ${e.message}`);
  }
  return r;
}

// Sends the edit. GitHub answers 204 No Content when the dispatch is accepted;
// the run itself starts a few seconds later.
export async function dispatchEdit(env, clientPayload) {
  const r = await call(
    env,
    `/repos/${REPO}/dispatches`,
    { method: "POST", body: JSON.stringify({ event_type: "edit", client_payload: clientPayload }), headers: { "Content-Type": "application/json" } },
    "sending the edit",
  );
  if (r.status !== 204) throw new GitHubError(explain(r.status, "sending the edit"));
}

function runInfo(run) {
  const m = TITLE.exec(run.display_title || "");
  if (!m) return null; // a run that didn't come from the mod page
  return {
    requestId: m[1],
    editor: m[2],
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    url: run.html_url,
  };
}

// The newest runs of the edit workflow, newest first, as runInfo objects.
export async function listRuns(env, perPage = 15) {
  const r = await call(env, `/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=${perPage}`, { method: "GET" }, "reading the edit runs");
  if (r.status !== 200) throw new GitHubError(explain(r.status, "reading the edit runs"));
  const body = await r.json();
  return (body.workflow_runs || []).map((run) => [run, runInfo(run)]).filter(([, info]) => info);
}

// Why a failed run failed: apply-edit.py prints its refusal as an
// "Edit refused" error annotation (the first line of the job summary). Null
// when there's no such annotation (e.g. the run crashed or was cancelled).
export async function refusalReason(env, run) {
  try {
    const jr = await call(env, `/repos/${REPO}/actions/runs/${run.id}/jobs?per_page=5`, { method: "GET" }, "reading the run");
    if (jr.status !== 200) return null;
    for (const job of (await jr.json()).jobs || []) {
      const ar = await call(env, `/repos/${REPO}/check-runs/${job.id}/annotations`, { method: "GET" }, "reading the run");
      if (ar.status !== 200) continue;
      const hit = (await ar.json()).find((a) => a.annotation_level === "failure" && a.title === "Edit refused");
      if (hit) return hit.message;
    }
  } catch {
    // the reason is a nicety: the run's page on GitHub has it too
  }
  return null;
}
