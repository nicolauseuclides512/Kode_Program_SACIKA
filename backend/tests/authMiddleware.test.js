const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const {
  allowRoles,
  extractBearerToken,
  verifyToken,
} = require("../middleware/authMiddleware");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

test("extractBearerToken only accepts a valid Bearer header", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken("Bearer"), null);
  assert.equal(extractBearerToken(undefined), null);
});

test("verifyToken rejects request without token", () => {
  const req = { headers: {} };
  const res = createResponse();
  let called = false;

  verifyToken(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test("verifyToken accepts valid token and populates req.user", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test_secret_that_is_long_enough_for_sacika";

  try {
    const token = jwt.sign(
      { id: 1, username: "admin", role: "admin" },
      process.env.JWT_SECRET,
      {
        issuer: "sacika-backend",
        audience: "sacika-frontend",
        expiresIn: "5m",
      },
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = createResponse();
    let called = false;

    verifyToken(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
    assert.deepEqual(req.user, {
      id: 1,
      username: "admin",
      role: "admin",
    });
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("allowRoles permits matching role and denies other roles", () => {
  const middleware = allowRoles("admin");
  const adminRequest = { user: { role: "admin" } };
  const staffRequest = { user: { role: "staff" } };
  const adminResponse = createResponse();
  const staffResponse = createResponse();
  let adminCalled = false;
  let staffCalled = false;

  middleware(adminRequest, adminResponse, () => {
    adminCalled = true;
  });
  middleware(staffRequest, staffResponse, () => {
    staffCalled = true;
  });

  assert.equal(adminCalled, true);
  assert.equal(staffCalled, false);
  assert.equal(staffResponse.statusCode, 403);
});
