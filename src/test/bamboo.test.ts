import assert from "node:assert/strict";
import test from "node:test";
import {
  bambooBrowseUrl,
  bambooCurrentUserUrl,
  bambooInfoUrl,
  bambooPlanCount,
  bambooPlansUrl,
  bambooProjectsUrl,
  bambooResultDetailUrl,
  bambooResultsUrl,
  normaliseBambooBaseUrl,
  normaliseBambooStatus,
  parseBambooCurrentUser,
  parseBambooPlanName,
  parseBambooPlans,
  parseBambooProjects,
  parseBambooResults,
  parseBambooStages,
} from "../core/bamboo";

const BASE = "https://bamboo.example.com";

// ---------- URL building ----------

test("normaliseBambooBaseUrl: trims whitespace and trailing slashes only", () => {
  assert.equal(normaliseBambooBaseUrl(" https://bamboo.example.com/ "), "https://bamboo.example.com");
  assert.equal(normaliseBambooBaseUrl("https://bamboo.example.com/bamboo//"), "https://bamboo.example.com/bamboo");
  // No GitHub-style suffix is ever appended.
  assert.equal(normaliseBambooBaseUrl("https://bamboo.example.com"), "https://bamboo.example.com");
});

test("bamboo URL builders follow the documented REST layout", () => {
  assert.equal(bambooInfoUrl(BASE), "https://bamboo.example.com/rest/api/latest/info");
  assert.equal(bambooCurrentUserUrl(BASE), "https://bamboo.example.com/rest/api/latest/currentUser");
  assert.equal(
    bambooPlansUrl(BASE),
    "https://bamboo.example.com/rest/api/latest/plan?expand=plans.plan&max-results=500&start-index=0",
  );
  assert.equal(bambooProjectsUrl(BASE), "https://bamboo.example.com/rest/api/latest/project?expand=projects.project&max-results=500");
  assert.equal(
    bambooResultsUrl(BASE, "PROJ-PLAN"),
    "https://bamboo.example.com/rest/api/latest/result/PROJ-PLAN?expand=results.result&max-results=10",
  );
  assert.equal(
    bambooResultDetailUrl(BASE, "PROJ-PLAN-123"),
    "https://bamboo.example.com/rest/api/latest/result/PROJ-PLAN-123?expand=stages.stage.results.result",
  );
  assert.equal(bambooBrowseUrl(BASE, "PROJ-PLAN-123"), "https://bamboo.example.com/browse/PROJ-PLAN-123");
  assert.equal(bambooBrowseUrl(BASE, "PROJ-PLAN"), "https://bamboo.example.com/browse/PROJ-PLAN");
});

// ---------- status normalisation ----------

test("normaliseBambooStatus: lifecycle wins while a build is not finished", () => {
  assert.equal(normaliseBambooStatus("Unknown", "InProgress"), "running");
  assert.equal(normaliseBambooStatus(undefined, "Queued"), "running");
  assert.equal(normaliseBambooStatus(undefined, "Pending"), "running");
});

test("normaliseBambooStatus: finished builds map by buildState", () => {
  assert.equal(normaliseBambooStatus("Successful", "Finished"), "success");
  assert.equal(normaliseBambooStatus("Failed", "Finished"), "failure");
  assert.equal(normaliseBambooStatus("Unknown", "Finished"), "other");
  assert.equal(normaliseBambooStatus(undefined, "NotBuilt"), "other");
  assert.equal(normaliseBambooStatus(undefined, undefined), "other");
});

// ---------- results ----------

// Shape per the bamboo-dc-analysis references: the result list lives in
// `results.result`; entries carry plan, key, buildNumber, lifeCycleState,
// buildState, reasonSummary and a self link.
const RESULTS_PAYLOAD = {
  results: {
    size: 3,
    "start-index": 0,
    "max-result": 10,
    result: [
      {
        id: 9001,
        key: "PROJ-PLAN-123",
        plan: { key: "PROJ-PLAN", name: "My Project - My Plan", projectKey: "PROJ" },
        buildNumber: 123,
        lifeCycleState: "Finished",
        buildState: "Failed",
        reasonSummary: "Changes by A. Developer",
        buildStartedTime: "2026-11-21T09:00:00.000+09:00",
        buildCompletedTime: "2026-11-21T09:04:30.000+09:00",
        link: { href: "https://bamboo.example.com/browse/PROJ-PLAN-123", rel: "self" },
      },
      {
        id: 9000,
        key: "PROJ-PLAN-122",
        plan: { key: "PROJ-PLAN", name: "My Project - My Plan", projectKey: "PROJ" },
        resultNumber: 122,
        lifeCycleState: "InProgress",
        buildState: "Unknown",
        reasonSummary: "Manual run",
        buildStartedTime: "2026-11-21T09:05:00.000+09:00",
        link: { href: "https://bamboo.example.com/browse/PROJ-PLAN-122", rel: "self" },
      },
      {
        key: "PROJ-PLAN-121",
        plan: { key: "PROJ-PLAN", name: "My Project - My Plan", projectKey: "PROJ" },
        buildNumber: 121,
        lifeCycleState: "Finished",
        buildState: "Successful",
        reasonSummary: "Successful since last failure",
      },
    ],
  },
};

test("parseBambooResults: maps the documented list shape", () => {
  const runs = parseBambooResults(RESULTS_PAYLOAD, BASE);
  assert.equal(runs.length, 3);
  const [failed, running, ok] = runs;
  assert.equal(failed.id, 9001);
  assert.equal(failed.key, "PROJ-PLAN-123");
  assert.equal(failed.runNumber, 123);
  assert.equal(failed.status, "failure");
  assert.equal(failed.title, "Changes by A. Developer");
  assert.equal(failed.htmlUrl, "https://bamboo.example.com/browse/PROJ-PLAN-123");
  assert.equal(failed.createdAt, "2026-11-21T09:00:00.000+09:00");
  assert.equal(failed.updatedAt, "2026-11-21T09:04:30.000+09:00");
  // Bamboo payloads carry no reliable actor: the person mark stays empty.
  assert.equal(failed.actorLogin, "");
  assert.equal(running.runNumber, 122); // resultNumber fallback
  assert.equal(running.status, "running");
  assert.equal(ok.status, "success");
  assert.equal(ok.id, 121); // id derived from the key's trailing number
  assert.equal(ok.htmlUrl, "https://bamboo.example.com/browse/PROJ-PLAN-121"); // browse URL fallback
});

test("parseBambooResults: a single result object is wrapped, junk yields []", () => {
  const single = { results: { result: RESULTS_PAYLOAD.results.result[0] } };
  const runs = parseBambooResults(single, BASE);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runNumber, 123);
  assert.deepEqual(parseBambooResults(null, BASE), []);
  assert.deepEqual(parseBambooResults({}, BASE), []);
  assert.deepEqual(parseBambooResults({ results: { result: [] } }, BASE), []);
});

test("parseBambooResults: branch name is read when the payload carries one", () => {
  const payload = {
    results: {
      result: [
        { key: "PROJ-PLAN-9", buildNumber: 9, lifeCycleState: "Finished", buildState: "Successful", planBranchName: "feature/x" },
        { key: "PROJ-PLAN-8", buildNumber: 8, lifeCycleState: "Finished", buildState: "Successful", branch: { name: "develop" } },
        { key: "PROJ-PLAN-7", buildNumber: 7, lifeCycleState: "Finished", buildState: "Successful" },
      ],
    },
  };
  const runs = parseBambooResults(payload, BASE);
  assert.equal(runs[0].branch, "feature/x");
  assert.equal(runs[1].branch, "develop");
  assert.equal(runs[2].branch, "");
});

test("parseBambooPlanName: the first result's plan name, else undefined", () => {
  assert.equal(parseBambooPlanName(RESULTS_PAYLOAD), "My Project - My Plan");
  assert.equal(parseBambooPlanName({ results: { result: [] } }), undefined);
  assert.equal(parseBambooPlanName(null), undefined);
});

// ---------- plans & projects (discovery) ----------

const PLANS_PAYLOAD = {
  plans: {
    size: 2,
    "start-index": 0,
    "max-result": 500,
    plan: [
      {
        key: "PROJ-PLAN",
        name: "My Plan",
        projectKey: "PROJ",
        projectName: "My Project",
        enabled: true,
        link: { href: "https://bamboo.example.com/rest/api/latest/plan/PROJ-PLAN", rel: "self" },
      },
      {
        key: "OPS-DEPLOY",
        shortName: "Deploy",
        project: { key: "OPS", name: "Operations" },
        enabled: true,
      },
    ],
  },
};

test("parseBambooPlans: keys, names and project grouping fields", () => {
  const plans = parseBambooPlans(PLANS_PAYLOAD);
  assert.equal(plans.length, 2);
  // Sorted by project key, then plan key (OPS before PROJ).
  assert.deepEqual(plans[0], {
    projectKey: "OPS",
    projectName: "Operations",
    planKey: "OPS-DEPLOY",
    name: "Deploy",
    enabled: true,
  });
  assert.deepEqual(plans[1], {
    projectKey: "PROJ",
    projectName: "My Project",
    planKey: "PROJ-PLAN",
    name: "My Plan",
    enabled: true,
  });
  assert.deepEqual(parseBambooPlans({}), []);
  assert.deepEqual(parseBambooPlans(null), []);
});

test("parseBambooProjects: key/name pairs for discovery grouping", () => {
  const projects = parseBambooProjects({
    projects: { project: [{ key: "PROJ", name: "My Project" }, { key: "OPS", name: "Operations" }] },
  });
  assert.deepEqual(projects, [
    { key: "PROJ", name: "My Project" },
    { key: "OPS", name: "Operations" },
  ]);
  assert.deepEqual(parseBambooProjects(null), []);
});

// ---------- current user (liveness probe + connection test) ----------

test("parseBambooCurrentUser: accepts the documented name spellings", () => {
  assert.equal(parseBambooCurrentUser({ name: "msatake" }), "msatake");
  assert.equal(parseBambooCurrentUser({ username: "msatake" }), "msatake");
  assert.equal(parseBambooCurrentUser({ userName: "msatake" }), "msatake");
  assert.equal(parseBambooCurrentUser({}), undefined);
  assert.equal(parseBambooCurrentUser(null), undefined);
});

// ---------- stages / jobs (lazy build detail) ----------

const DETAIL_PAYLOAD = {
  key: "PROJ-PLAN-123",
  stages: {
    size: 1,
    stage: [
      {
        name: "Default Stage",
        lifeCycleState: "Finished",
        results: {
          size: 2,
          result: [
            {
              id: 7001,
              key: "PROJ-PLAN-JOB1-123",
              jobName: "Default Job",
              lifeCycleState: "Finished",
              buildState: "Successful",
              link: { href: "https://bamboo.example.com/browse/PROJ-PLAN-JOB1-123", rel: "self" },
            },
            {
              id: 7002,
              key: "PROJ-PLAN-JOB2-123",
              lifeCycleState: "Finished",
              buildState: "Failed",
              link: { href: "https://bamboo.example.com/browse/PROJ-PLAN-JOB2-123", rel: "self" },
            },
          ],
        },
      },
    ],
  },
};

test("parseBambooStages: flattens stage results into jobs", () => {
  const jobs = parseBambooStages(DETAIL_PAYLOAD);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].name, "Default Job");
  assert.equal(jobs[0].status, "success");
  assert.equal(jobs[0].htmlUrl, "https://bamboo.example.com/browse/PROJ-PLAN-JOB1-123");
  // Without a jobName, the job segment of the result key is the label.
  assert.equal(jobs[1].name, "JOB2");
  assert.equal(jobs[1].status, "failure");
  assert.deepEqual(parseBambooStages({}), []);
  assert.deepEqual(parseBambooStages({ stages: { stage: [] } }), []);
});

test("parseBambooResults: undeterminable ids get distinct negative fallbacks (L8)", () => {
  const payload = {
    results: {
      result: [
        { buildState: "Failed", lifeCycleState: "Finished" },
        { buildState: "Successful", lifeCycleState: "Finished" },
        { id: 42, buildState: "Successful", lifeCycleState: "Finished" },
      ],
    },
  };
  const runs = parseBambooResults(payload, BASE);
  assert.equal(runs.length, 3);
  assert.ok(runs[0].id < 0 && runs[1].id < 0);
  assert.notEqual(runs[0].id, runs[1].id);
  assert.equal(runs[2].id, 42);
});

test("bambooPlansUrl: paging parameters (E6)", () => {
  assert.equal(
    bambooPlansUrl(BASE),
    "https://bamboo.example.com/rest/api/latest/plan?expand=plans.plan&max-results=500&start-index=0",
  );
  assert.equal(
    bambooPlansUrl(BASE, 1000),
    "https://bamboo.example.com/rest/api/latest/plan?expand=plans.plan&max-results=500&start-index=1000",
  );
});

test("bambooPlanCount: counts raw entries before parsing drops any (E6)", () => {
  assert.equal(bambooPlanCount(PLANS_PAYLOAD), PLANS_PAYLOAD.plans.plan.length);
  assert.equal(bambooPlanCount({ plans: { plan: { key: "P-A" } } }), 1);
  assert.equal(bambooPlanCount({}), 0);
  assert.equal(bambooPlanCount(null), 0);
});
