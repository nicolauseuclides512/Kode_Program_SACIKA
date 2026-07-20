const test = require("node:test");
const assert = require("node:assert/strict");

const {
  errorHandler,
  normalizeError,
  notFoundHandler,
} = require("../middleware/errorHandler");
const { createHttpError } = require("../utils/httpError");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test("PostgreSQL error details are not exposed to the client", () => {
  const error = new Error('duplicate key value violates unique constraint "produk_nama_key"');
  error.code = "23505";
  error.detail = "Key (nama_produk)=(Rahasia) already exists";
  error.query = "INSERT INTO produk ...";

  const normalized = normalizeError(error);
  assert.equal(normalized.statusCode, 409);
  assert.equal(normalized.code, "RESOURCE_CONFLICT");
  assert.equal(JSON.stringify(normalized).includes("produk_nama_key"), false);
  assert.equal(JSON.stringify(normalized).includes("INSERT INTO"), false);
});

test("unknown server errors return a generic response", () => {
  const error = new Error("password=secret; SELECT * FROM pengguna");
  const req = { method: "GET", originalUrl: "/api/test" };
  const res = createResponse();

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(error, req, res, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    message: "Terjadi kesalahan pada server",
    code: "INTERNAL_SERVER_ERROR",
  });
});

test("public HttpError keeps safe validation details", () => {
  const error = createHttpError(400, "Input tidak valid", {
    code: "INVALID_INPUT",
    details: ["jumlah wajib positif"],
  });
  const normalized = normalizeError(error);
  assert.deepEqual(normalized, {
    statusCode: 400,
    code: "INVALID_INPUT",
    message: "Input tidak valid",
    details: ["jumlah wajib positif"],
  });
});

test("not found handler returns a stable public response", () => {
  const res = createResponse();
  notFoundHandler({}, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "ROUTE_NOT_FOUND");
});
