const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";

const { createApp } = require("../server");

function request(server, options = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: options.path || "/",
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test("Helmet security headers are present and X-Powered-By is disabled", async () => {
  const server = createApp({ allowedOrigins: ["http://localhost:5173"] }).listen(0);
  try {
    const response = await request(server);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-powered-by"], undefined);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.ok(response.headers["content-security-policy"]);
  } finally {
    server.close();
  }
});

test("CORS allows configured origin and rejects unknown origin", async () => {
  const server = createApp({ allowedOrigins: ["http://localhost:5173"] }).listen(0);
  try {
    const allowed = await request(server, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:5173");

    const denied = await request(server, {
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(denied.statusCode, 403);
    const body = JSON.parse(denied.body);
    assert.equal(body.code, "CORS_ORIGIN_DENIED");
    assert.equal(body.message.includes("evil.example"), false);
  } finally {
    server.close();
  }
});

test("invalid JSON is handled by the global error handler", async () => {
  const server = createApp({ allowedOrigins: ["http://localhost:5173"] }).listen(0);
  try {
    const response = await request(server, {
      path: "/api/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid-json",
    });
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).code, "INVALID_JSON");
  } finally {
    server.close();
  }
});
