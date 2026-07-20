const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

process.env.JSON_BODY_LIMIT = "1kb";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
process.env.REQUEST_LOG_ENABLED = "false";
const { createApp } = require("../server");

function request(server, options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, ...options }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("JSON body larger than configured limit returns 413 with request ID", async () => {
  const server = createApp({ allowedOrigins: ["http://localhost:5173"] }).listen(0);
  try {
    const result = await request(server, {
      method: "POST",
      path: "/api/login",
      headers: { "content-type": "application/json" },
    }, JSON.stringify({ username: "a".repeat(1500), password: "x" }));
    assert.equal(result.status, 413);
    assert.equal(result.body.code, "PAYLOAD_TOO_LARGE");
    assert.ok(result.body.request_id);
  } finally {
    server.close();
  }
});
