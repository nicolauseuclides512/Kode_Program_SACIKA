const crypto = require("crypto");

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function getRequestId(req) {
  const supplied = String(req.get("x-request-id") || "").trim();
  return SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function requestIdMiddleware(req, res, next) {
  req.requestId = getRequestId(req);
  res.locals.requestId = req.requestId;
  res.setHeader("X-Request-ID", req.requestId);
  next();
}

function isRequestLoggingEnabled() {
  return String(process.env.REQUEST_LOG_ENABLED ?? "true").toLowerCase() !== "false";
}

function requestLogger(req, res, next) {
  if (!isRequestLoggingEnabled()) return next();
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const log = {
      timestamp: new Date().toISOString(),
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
      user_id: req.user?.id || null,
      role: req.user?.role || null,
    };

    const writer = res.statusCode >= 500 ? console.error : console.info;
    writer("[SACIKA_HTTP]", log);
  });

  next();
}

module.exports = {
  getRequestId,
  isRequestLoggingEnabled,
  requestIdMiddleware,
  requestLogger,
};
