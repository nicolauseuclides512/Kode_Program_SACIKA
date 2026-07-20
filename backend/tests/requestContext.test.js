const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getRequestId,
  requestIdMiddleware,
} = require("../middleware/requestContext");

test("request ID keeps a safe supplied value and replaces unsafe values", () => {
  assert.equal(getRequestId({ get: () => "client-request-123" }), "client-request-123");
  assert.match(getRequestId({ get: () => "bad id with spaces" }), /^[0-9a-f-]{36}$/);
});

test("requestIdMiddleware exposes request ID in response header", () => {
  const req = { get: () => "request-abcdefgh" };
  const headers = {};
  const res = { locals: {}, setHeader: (name, value) => { headers[name] = value; } };
  let called = false;
  requestIdMiddleware(req, res, () => { called = true; });
  assert.equal(req.requestId, "request-abcdefgh");
  assert.equal(headers["X-Request-ID"], "request-abcdefgh");
  assert.equal(called, true);
});
