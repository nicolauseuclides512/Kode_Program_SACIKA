const test = require("node:test");
const assert = require("node:assert/strict");

const { createLoginRateLimiter } = require("../middleware/loginRateLimiter");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runMiddleware(middleware, req) {
  const res = createResponse();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test("login limiter blocks a username and IP after repeated failures", () => {
  let currentTime = 1000;
  const limiter = createLoginRateLimiter({
    windowMs: 60000,
    maxAttempts: 2,
    blockMs: 120000,
    now: () => currentTime,
  });
  const baseReq = {
    ip: "127.0.0.1",
    headers: {},
    body: { username: "Admin" },
  };

  const first = runMiddleware(limiter, { ...baseReq, body: { ...baseReq.body } });
  assert.equal(first.nextCalled, true);
  first.req.loginRateLimit.recordFailure();

  const second = runMiddleware(limiter, { ...baseReq, body: { ...baseReq.body } });
  assert.equal(second.nextCalled, true);
  second.req.loginRateLimit.recordFailure();

  const blocked = runMiddleware(limiter, { ...baseReq, body: { ...baseReq.body } });
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.ok(Number(blocked.res.headers["Retry-After"]) > 0);

  currentTime += 120001;
  const afterBlock = runMiddleware(limiter, { ...baseReq, body: { ...baseReq.body } });
  assert.equal(afterBlock.nextCalled, true);
});

test("successful login reset removes previous failures", () => {
  const limiter = createLoginRateLimiter({
    windowMs: 60000,
    maxAttempts: 2,
    blockMs: 120000,
    now: () => 1000,
  });
  const request = {
    ip: "127.0.0.1",
    headers: {},
    body: { username: "admin" },
  };

  const first = runMiddleware(limiter, { ...request, body: { ...request.body } });
  first.req.loginRateLimit.recordFailure();

  const success = runMiddleware(limiter, { ...request, body: { ...request.body } });
  success.req.loginRateLimit.reset();

  const next = runMiddleware(limiter, { ...request, body: { ...request.body } });
  assert.equal(next.nextCalled, true);
  assert.equal(limiter._store.size, 0);
});
