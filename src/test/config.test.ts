import assert from "node:assert/strict";
import test from "node:test";
import {
  clampIntervalSeconds,
  MAX_ACCOUNTS,
  MAX_GROUPS,
  MAX_WATCHED_ITEMS,
  sanitiseConfig,
  toNotificationScope,
} from "../core/config";
import { mapPool } from "../core/pool";
import { isRateLimited, rateLimitResetAt, RATE_LIMIT_MAX_MS } from "../core/ratelimit";
import { isHttpUrlString, sameHost, sanitiseBaseUrl } from "../core/url";

// ---------- sanitiseConfig (M1 / L1 / L4 / L5) ----------

test("sanitiseConfig: a well-formed config passes through", () => {
  const config = sanitiseConfig({
    accounts: [{ id: "a1", name: "work", baseUrl: "https://api.github.com", kind: "github" }],
    groups: [
      {
        id: "g1",
        name: "Releases",
        accountId: "a1",
        workflows: [{ owner: "o", repo: "r", workflow: "ci.yml", starred: true }],
      },
    ],
  });
  assert.equal(config.accounts.length, 1);
  assert.equal(config.accounts[0].baseUrl, "https://api.github.com");
  assert.equal(config.groups[0].workflows.length, 1);
});

test("sanitiseConfig: wrong-typed fields are coerced, malformed entries dropped", () => {
  const config = sanitiseConfig({
    accounts: [
      { id: "a1", name: 42, baseUrl: null }, // name/baseUrl coerce to ""
      { name: "no id" }, // dropped: id missing
      { id: 7, name: "numeric id" }, // dropped: id wrong type
      "junk", // dropped: not an object
    ],
    groups: [
      { id: "g1", name: [], accountId: "a1", workflows: "nope" }, // workflows -> []
      { id: "g2", accountId: "a1" }, // name -> "", workflows -> []
      { name: "no id", accountId: "a1", workflows: [] }, // dropped
      { id: "g3", workflows: [] }, // dropped: accountId missing
    ],
  });
  assert.deepEqual(
    config.accounts.map((a) => a.id),
    ["a1"],
  );
  assert.equal(config.accounts[0].name, "");
  assert.equal(config.accounts[0].baseUrl, "");
  assert.deepEqual(
    config.groups.map((g) => g.id),
    ["g1", "g2"],
  );
  assert.deepEqual(config.groups[0].workflows, []);
  assert.equal(config.groups[1].name, "");
});

test("sanitiseConfig: entries missing required fields are dropped, others kept", () => {
  const config = sanitiseConfig({
    accounts: [],
    groups: [
      {
        id: "g1",
        name: "G",
        accountId: "a1",
        workflows: [
          { owner: "o", repo: "r", workflow: "ci.yml" },
          { owner: "o", repo: "r" }, // dropped: workflow missing
          { owner: "o", repo: 3, workflow: "ci.yml" }, // dropped: repo wrong type
          { projectKey: "P", planKey: "P-PLAN" },
          { planKey: "P-PLAN2" }, // dropped: projectKey missing
          null,
        ],
      },
    ],
  });
  assert.equal(config.groups[0].workflows.length, 2);
});

test("sanitiseConfig: non-http(s) base URLs are coerced to empty (L1)", () => {
  const config = sanitiseConfig({
    accounts: [
      { id: "a1", name: "", baseUrl: "ftp://example.com" },
      { id: "a2", name: "", baseUrl: "javascript:alert(1)" },
      { id: "a3", name: "", baseUrl: "not a url" },
      { id: "a4", name: "", baseUrl: " http://ghes.example.com/api/v3 " },
    ],
    groups: [],
  });
  assert.equal(config.accounts[0].baseUrl, "");
  assert.equal(config.accounts[1].baseUrl, "");
  assert.equal(config.accounts[2].baseUrl, "");
  assert.equal(config.accounts[3].baseUrl, "http://ghes.example.com/api/v3");
});

test("sanitiseConfig: duplicate account ids keep the first (L4)", () => {
  const config = sanitiseConfig({
    accounts: [
      { id: "a1", name: "first", baseUrl: "https://api.github.com" },
      { id: "a1", name: "second", baseUrl: "https://other.example.com" },
    ],
    groups: [],
  });
  assert.equal(config.accounts.length, 1);
  assert.equal(config.accounts[0].name, "first");
});

test("sanitiseConfig: totals are capped at read time (L5)", () => {
  const accounts = Array.from({ length: MAX_ACCOUNTS + 10 }, (_, i) => ({
    id: `a${i}`,
    name: "",
    baseUrl: "https://api.github.com",
  }));
  const groups = Array.from({ length: MAX_GROUPS + 10 }, (_, i) => ({
    id: `g${i}`,
    name: "",
    accountId: "a0",
    workflows: Array.from({ length: 20 }, (_, j) => ({ owner: "o", repo: "r", workflow: `w${j}.yml` })),
  }));
  const config = sanitiseConfig({ accounts, groups });
  assert.equal(config.accounts.length, MAX_ACCOUNTS);
  assert.equal(config.groups.length, MAX_GROUPS);
  const totalItems = config.groups.reduce((n, g) => n + g.workflows.length, 0);
  assert.equal(totalItems, MAX_WATCHED_ITEMS);
});

test("sanitiseConfig: non-object roots yield an empty config", () => {
  assert.deepEqual(sanitiseConfig(null), { accounts: [], groups: [] });
  assert.deepEqual(sanitiseConfig("junk"), { accounts: [], groups: [] });
  assert.deepEqual(sanitiseConfig({ accounts: "x", groups: 3 }), { accounts: [], groups: [] });
});

// ---------- intervals & scope (M2 / L3) ----------

test("clampIntervalSeconds: finite values clamp at both ends, junk falls back", () => {
  assert.equal(clampIntervalSeconds(30, 10, 3600, 30), 30);
  assert.equal(clampIntervalSeconds(5, 10, 3600, 30), 10);
  assert.equal(clampIntervalSeconds(99999, 10, 3600, 30), 3600);
  assert.equal(clampIntervalSeconds(Number.NaN, 10, 3600, 30), 30);
  assert.equal(clampIntervalSeconds(Number.POSITIVE_INFINITY, 10, 3600, 30), 30);
  assert.equal(clampIntervalSeconds("30", 10, 3600, 30), 30);
  assert.equal(clampIntervalSeconds(undefined, 10, 3600, 30), 30);
});

test("toNotificationScope: only the three known values survive", () => {
  assert.equal(toNotificationScope("all"), "all");
  assert.equal(toNotificationScope("mine"), "mine");
  assert.equal(toNotificationScope("starred"), "starred");
  assert.equal(toNotificationScope("everything"), "all");
  assert.equal(toNotificationScope(undefined), "all");
  assert.equal(toNotificationScope(3), "all");
});

// ---------- URL helpers (L1 / L2) ----------

test("isHttpUrlString / sanitiseBaseUrl / sameHost", () => {
  assert.equal(isHttpUrlString("https://api.github.com"), true);
  assert.equal(isHttpUrlString("http://localhost:8080/x"), true);
  assert.equal(isHttpUrlString("ftp://example.com"), false);
  assert.equal(isHttpUrlString("file:///etc/passwd"), false);
  assert.equal(isHttpUrlString(""), false);
  assert.equal(sanitiseBaseUrl(42), "");
  assert.equal(sanitiseBaseUrl(" https://example.com/ "), "https://example.com/");
  assert.equal(sameHost("https://a.example.com/x", "https://a.example.com/y"), true);
  assert.equal(sameHost("https://a.example.com", "https://b.example.com"), false);
  assert.equal(sameHost("https://a.example.com", "not a url"), false);
});

// ---------- rate limiting (E2) ----------

test("rateLimitResetAt: only 429 pauses, Retry-After wins and is capped", () => {
  const now = 1_000_000;
  assert.equal(rateLimitResetAt(200, 5000, now, 120_000), undefined);
  assert.equal(rateLimitResetAt(500, 5000, now, 120_000), undefined);
  assert.equal(rateLimitResetAt(429, 5000, now, 120_000), now + 5000);
  assert.equal(rateLimitResetAt(429, RATE_LIMIT_MAX_MS * 4, now, 120_000), now + RATE_LIMIT_MAX_MS);
  // No usable Retry-After: fall back to the liveness-cycle spacing.
  assert.equal(rateLimitResetAt(429, undefined, now, 120_000), now + 120_000);
});

test("isRateLimited: true only inside the pause window", () => {
  assert.equal(isRateLimited(undefined, 100), false);
  assert.equal(isRateLimited(200, 100), true);
  assert.equal(isRateLimited(200, 200), false);
  assert.equal(isRateLimited(200, 300), false);
});

// ---------- bounded concurrency (P1) ----------

test("mapPool: never exceeds the limit and returns every result in order", async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const results = await mapPool(items, 6, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(results, items.map((n) => n * 2));
  assert.ok(peak > 1, "expected some parallelism");
  assert.ok(peak <= 6, `peak ${peak} exceeded the limit`);
});

test("mapPool: empty input and a limit above the length are fine", async () => {
  assert.deepEqual(await mapPool([], 6, async (n: number) => n), []);
  assert.deepEqual(await mapPool([1, 2], 6, async (n) => n + 1), [2, 3]);
});
