const { once } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  applyAllMigrations,
  createTestPool,
  requireTestDatabaseUrl,
  resetPublicSchema,
} = require("./helpers");

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

test("autentikasi terintegrasi menggunakan bcrypt, JWT, role, dan status aktif", {
  timeout: 120000,
}, async () => {
  const testUrl = requireTestDatabaseUrl();
  process.env.DATABASE_URL = testUrl;
  process.env.JWT_SECRET = "integration_test_secret_that_is_longer_than_32_characters";
  process.env.JWT_EXPIRES_IN = "5m";
  process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  process.env.REQUEST_LOG_ENABLED = "false";
  process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "20";

  const pool = createTestPool();
  let server;
  let applicationPool;

  try {
    await resetPublicSchema(pool);
    await applyAllMigrations(pool);
    const passwordHash = await bcrypt.hash("AdminIntegration2026", 12);
    const insert = await pool.query(
      `
        INSERT INTO pengguna(nama, username, password_hash, role, is_active)
        VALUES('Admin Test', 'admin_test', $1, 'admin', TRUE)
        RETURNING id
      `,
      [passwordHash],
    );
    const userId = Number(insert.rows[0].id);

    const { createApp } = require("../../server");
    applicationPool = require("../../config/database");
    const app = createApp({ allowedOrigins: ["http://localhost:5173"] });
    server = app.listen(0);
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const success = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "ADMIN_TEST", password: "AdminIntegration2026" }),
    });
    assert.equal(success.response.status, 200);
    assert.ok(success.body.token);
    assert.equal(success.body.user.username, "admin_test");
    assert.equal("password_hash" in success.body.user, false);

    const wrong = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin_test", password: "salah" }),
    });
    assert.equal(wrong.response.status, 401);

    const protectedWithoutToken = await request(baseUrl, "/api/kategori");
    assert.equal(protectedWithoutToken.response.status, 401);

    const protectedWithToken = await request(baseUrl, "/api/kategori", {
      headers: { Authorization: `Bearer ${success.body.token}` },
    });
    assert.equal(protectedWithToken.response.status, 200);

    await pool.query("UPDATE pengguna SET is_active=FALSE WHERE id=$1", [userId]);
    const inactive = await request(baseUrl, "/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin_test", password: "AdminIntegration2026" }),
    });
    assert.equal(inactive.response.status, 403);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (applicationPool) await applicationPool.end();
    await pool.end();
  }
});
