const { getLoginRateLimitConfig } = require("../config/security");

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getClientAddress(req) {
  return req.ip
    || req.socket?.remoteAddress
    || req.connection?.remoteAddress
    || "unknown";
}

function createLoginRateLimiter(options = {}) {
  const config = {
    ...getLoginRateLimitConfig(),
    ...options,
  };
  const store = options.store || new Map();
  const now = options.now || (() => Date.now());

  function makeKey(req) {
    const username = normalizeUsername(req.body?.username) || "anonymous";
    return `${getClientAddress(req)}::${username}`;
  }

  function cleanupEntry(entry, currentTime) {
    if (!entry) return null;

    if (entry.blockedUntil && entry.blockedUntil <= currentTime) {
      return null;
    }

    if (!entry.blockedUntil && entry.windowStartedAt + config.windowMs <= currentTime) {
      return null;
    }

    return entry;
  }

  function middleware(req, res, next) {
    const key = makeKey(req);
    const currentTime = now();
    const existing = cleanupEntry(store.get(key), currentTime);

    if (!existing) {
      store.delete(key);
    }

    if (existing?.blockedUntil && existing.blockedUntil > currentTime) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.blockedUntil - currentTime) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: "Terlalu banyak percobaan login. Silakan coba kembali nanti.",
        retry_after_seconds: retryAfterSeconds,
      });
    }

    req.loginRateLimit = {
      recordFailure() {
        const failureTime = now();
        const current = cleanupEntry(store.get(key), failureTime) || {
          attempts: 0,
          windowStartedAt: failureTime,
          blockedUntil: null,
        };

        current.attempts += 1;

        if (current.attempts >= config.maxAttempts) {
          current.blockedUntil = failureTime + config.blockMs;
        }

        store.set(key, current);
        return {
          attempts: current.attempts,
          blockedUntil: current.blockedUntil,
        };
      },
      reset() {
        store.delete(key);
      },
    };

    return next();
  }

  middleware._store = store;
  middleware._config = config;
  return middleware;
}

module.exports = {
  createLoginRateLimiter,
  getClientAddress,
  normalizeUsername,
};
