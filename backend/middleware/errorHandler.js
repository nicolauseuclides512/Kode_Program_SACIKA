const { HttpError } = require("../utils/httpError");

const POSTGRES_ERROR_MAP = {
  23505: {
    statusCode: 409,
    code: "RESOURCE_CONFLICT",
    message: "Data dengan nilai yang sama sudah tersedia",
  },
  23503: {
    statusCode: 409,
    code: "RESOURCE_IN_USE",
    message: "Data tidak dapat diubah karena masih digunakan oleh data lain",
  },
  23514: {
    statusCode: 400,
    code: "CONSTRAINT_VIOLATION",
    message: "Data tidak memenuhi ketentuan yang berlaku",
  },
  23502: {
    statusCode: 400,
    code: "REQUIRED_FIELD_MISSING",
    message: "Terdapat data wajib yang belum diisi",
  },
  "22P02": {
    statusCode: 400,
    code: "INVALID_VALUE_FORMAT",
    message: "Format data yang dikirim tidak valid",
  },
};

function normalizeError(error) {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code || "REQUEST_ERROR",
      message: error.expose
        ? error.message
        : "Terjadi kesalahan pada server",
      details: error.expose ? error.details : null,
    };
  }

  if (error?.type === "entity.too.large") {
    return {
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "Ukuran request terlalu besar",
      details: null,
    };
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return {
      statusCode: 400,
      code: "INVALID_JSON",
      message: "Body request harus berupa JSON yang valid",
      details: null,
    };
  }

  if (error?.code === "CORS_ORIGIN_DENIED") {
    return {
      statusCode: 403,
      code: "CORS_ORIGIN_DENIED",
      message: "Origin tidak diizinkan mengakses API",
      details: null,
    };
  }

  if (POSTGRES_ERROR_MAP[error?.code]) {
    return {
      ...POSTGRES_ERROR_MAP[error.code],
      details: null,
    };
  }

  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600) {
    const expose = error.statusCode < 500;
    return {
      statusCode: error.statusCode,
      code: error.code || "REQUEST_ERROR",
      message: expose ? error.message : "Terjadi kesalahan pada server",
      details: expose ? error.details || null : null,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Terjadi kesalahan pada server",
    details: null,
  };
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    message: "Endpoint tidak ditemukan",
    code: "ROUTE_NOT_FOUND",
  });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    console.error("[SACIKA_API_ERROR]", {
      method: req.method,
      path: req.originalUrl,
      error_name: error?.name,
      error_code: error?.code,
      message: error?.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error?.stack,
    });
  }

  const response = {
    message: normalized.message,
    code: normalized.code,
  };
  if (normalized.details) response.details = normalized.details;

  return res.status(normalized.statusCode).json(response);
}

module.exports = {
  errorHandler,
  normalizeError,
  notFoundHandler,
};
