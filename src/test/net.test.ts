import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson } from "../net";

/**
 * fetchJson against a stubbed global fetch: the redirect credential
 * rules are the security contract — the token follows a redirect only
 * on the same host, never across hosts, never down to cleartext http,
 * and non-http(s) targets are never followed at all.
 */

interface RecordedCall {
  url: string;
  authorization: string | undefined;
}

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    body: null,
    text: async () => body,
  } as unknown as Response;
}

async function withFetch(
  handler: (url: string) => Response,
  run: (calls: RecordedCall[]) => Promise<void>,
): Promise<void> {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
    const u = String(url);
    calls.push({ url: u, authorization: init?.headers?.Authorization });
    return handler(u);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("fetchJson: a plain 200 returns the parsed body and sends the token", async () => {
  await withFetch(
    () => fakeResponse(200, '{"ok":true}'),
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/api", "secret-token");
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { ok: true });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].authorization, "Bearer secret-token");
    },
  );
});

test("fetchJson: a same-host https redirect keeps the token", async () => {
  await withFetch(
    (url) =>
      url.includes("/start")
        ? fakeResponse(302, "", { location: "https://ci.example.com/final" })
        : fakeResponse(200, "{}"),
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/start", "secret-token");
      assert.equal(res.status, 200);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].authorization, "Bearer secret-token");
    },
  );
});

test("fetchJson: a cross-host redirect drops the token, and it stays dropped", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/start")) {
        return fakeResponse(302, "", { location: "https://other.example.net/hop" });
      }
      if (url.includes("other.example.net")) {
        return fakeResponse(302, "", { location: "https://ci.example.com/back" });
      }
      return fakeResponse(200, "{}");
    },
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/start", "secret-token");
      assert.equal(res.status, 200);
      assert.equal(calls.length, 3);
      assert.equal(calls[1].authorization, undefined);
      // Even back on the original host, the token is not sent again.
      assert.equal(calls[2].authorization, undefined);
    },
  );
});

test("fetchJson: an https-to-http downgrade on the same host drops the token", async () => {
  await withFetch(
    (url) =>
      url.startsWith("https://")
        ? fakeResponse(302, "", { location: "http://ci.example.com/final" })
        : fakeResponse(200, "{}"),
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/start", "secret-token");
      assert.equal(res.status, 200);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].url, "http://ci.example.com/final");
      assert.equal(calls[1].authorization, undefined);
    },
  );
});

test("fetchJson: a redirect to a non-http(s) scheme is never followed", async () => {
  await withFetch(
    () => fakeResponse(302, "redirect body", { location: "file:///etc/passwd" }),
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/start", "secret-token");
      assert.equal(calls.length, 1);
      assert.equal(res.status, 302);
    },
  );
});

test("fetchJson: the redirect budget is spent after 5 hops", async () => {
  await withFetch(
    (url) => {
      const n = Number(/hop(\d+)/.exec(url)?.[1] ?? "0");
      return fakeResponse(302, "", { location: `https://ci.example.com/hop${n + 1}` });
    },
    async (calls) => {
      const res = await fetchJson("https://ci.example.com/hop0", "secret-token");
      assert.equal(res.status, 302);
      assert.equal(calls.length, 6); // initial + 5 followed redirects
    },
  );
});
