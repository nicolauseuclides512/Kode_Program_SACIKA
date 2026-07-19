const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const bcrypt = require("bcryptjs");

function loadAuthControllerWithDb(fakeDb) {
  const dbPath = require.resolve(path.join(__dirname, "../config/database.js"));
  const authPath = require.resolve(path.join(__dirname, "../controllers/authController.js"));

  delete require.cache[authPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: fakeDb,
  };

  return require(path.join(__dirname, "../controllers/authController.js"));
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("login succeeds with bcrypt hash and case-insensitive username lookup", async () => {
  process.env.JWT_SECRET = "test-secret";
  const passwordHash = await bcrypt.hash("admin-secret", 4);
  const queries = [];
  const fakeDb = {
    async query(sql, params) {
      queries.push({ sql, params });
      return {
        rows: [{
          id: 1,
          nama: "Administrator",
          username: "admin",
          password_hash: passwordHash,
          is_active: true,
        }],
      };
    },
  };
  const controller = loadAuthControllerWithDb(fakeDb);
  const res = createResponse();

  await controller.login({ body: { username: "ADMIN", password: "admin-secret" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Login berhasil");
  assert.equal(res.body.user.username, "admin");
  assert.equal(typeof res.body.token, "string");
  assert.equal(Object.prototype.hasOwnProperty.call(res.body.user, "password_hash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(res.body, "password_hash"), false);
  assert.match(queries[0].sql, /LOWER\(BTRIM\(username\)\) = LOWER\(BTRIM\(\$1\)\)/);
});

test("login rejects wrong password without plaintext comparison", async () => {
  process.env.JWT_SECRET = "test-secret";
  const passwordHash = await bcrypt.hash("correct-password", 4);
  const fakeDb = {
    async query() {
      return {
        rows: [{
          id: 1,
          nama: "Administrator",
          username: "admin",
          password_hash: passwordHash,
          is_active: true,
        }],
      };
    },
  };
  const controller = loadAuthControllerWithDb(fakeDb);
  const res = createResponse();

  await controller.login({ body: { username: "admin", password: "wrong-password" } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, "Password salah");

  const source = require("node:fs").readFileSync(path.join(__dirname, "../controllers/authController.js"), "utf8");
  assert.doesNotMatch(source, /password\s*!==\s*user\.password/);
  assert.match(source, /bcrypt\.compare/);
});

test("login rejects inactive users", async () => {
  process.env.JWT_SECRET = "test-secret";
  const passwordHash = await bcrypt.hash("admin-secret", 4);
  const fakeDb = {
    async query() {
      return {
        rows: [{
          id: 1,
          nama: "Administrator",
          username: "admin",
          password_hash: passwordHash,
          is_active: false,
        }],
      };
    },
  };
  const controller = loadAuthControllerWithDb(fakeDb);
  const res = createResponse();

  await controller.login({ body: { username: "admin", password: "admin-secret" } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Pengguna tidak aktif");
});

test("login response never exposes password_hash", async () => {
  process.env.JWT_SECRET = "test-secret";
  const passwordHash = await bcrypt.hash("admin-secret", 4);
  const fakeDb = {
    async query() {
      return {
        rows: [{
          id: 1,
          nama: "Administrator",
          username: "admin",
          password_hash: passwordHash,
          is_active: true,
        }],
      };
    },
  };
  const controller = loadAuthControllerWithDb(fakeDb);
  const res = createResponse();

  await controller.login({ body: { username: "admin", password: "admin-secret" } }, res);

  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /password_hash/);
  assert.doesNotMatch(serialized, new RegExp(passwordHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
