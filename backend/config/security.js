const PLACEHOLDER_SECRET_PATTERNS = [
  /^replace[_-]?with/i,
  /^your[_-]?/i,
  /^change[_-]?me/i,
  /^changeme$/i,
  /^development[_-]?secret/i,
  /^jwt[_-]?secret$/i,
  /^worker[_-]?secret$/i,
  /^secret$/i,
];

function readPositiveIntegerEnv(name, fallback, options = {}) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return fallback;
  }

  const value = Number(rawValue);
  const minimum = options.minimum ?? 1;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} harus berupa integer antara ${minimum} dan ${maximum}.`,
    );
  }

  return value;
}

function readPercentageEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${name} harus berupa angka antara 0 dan 100.`);
  }

  return value;
}

function isPlaceholderSecret(secret) {
  const value = String(secret || "").trim();
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function readRequiredSecret(name, minimumLength = 32) {
  const secret = process.env[name]?.trim();

  if (!secret) {
    throw new Error(`${name} belum diatur pada environment.`);
  }

  if (secret.length < minimumLength) {
    throw new Error(`${name} minimal ${minimumLength} karakter.`);
  }

  if (isPlaceholderSecret(secret)) {
    throw new Error(`${name} masih menggunakan nilai contoh atau placeholder.`);
  }

  return secret;
}

function getJwtSecret() {
  return readRequiredSecret("JWT_SECRET", 32);
}

function getForecastWorkerApiKey() {
  return readRequiredSecret("FORECAST_WORKER_API_KEY", 32);
}

function normalizeOrigin(origin) {
  const text = String(origin || "").trim();
  if (!text) return null;
  if (text === "*") {
    throw new Error(
      "CORS_ALLOWED_ORIGINS tidak boleh menggunakan wildcard ketika credentials aktif.",
    );
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`Origin CORS tidak valid: ${text}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Origin CORS harus menggunakan http atau https: ${text}`);
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(`Origin CORS tidak boleh mengandung path, query, hash, atau credential: ${text}`);
  }

  return parsed.origin;
}

function getCorsAllowedOrigins() {
  const rawValue = process.env.CORS_ALLOWED_ORIGINS;
  const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();

  if (!rawValue || !rawValue.trim()) {
    if (nodeEnv === "production") {
      throw new Error("CORS_ALLOWED_ORIGINS wajib diisi pada environment production.");
    }
    return ["http://localhost:5173"];
  }

  const origins = Array.from(new Set(
    rawValue
      .split(",")
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
  ));

  if (origins.length === 0) {
    throw new Error("CORS_ALLOWED_ORIGINS tidak mempunyai origin valid.");
  }

  return origins;
}


function validateBodyLimit(value) {
  const text = String(value || "1mb").trim().toLowerCase();
  if (!/^\d+(?:b|kb|mb)?$/.test(text)) {
    throw new Error("JSON_BODY_LIMIT harus berupa ukuran seperti 512kb atau 1mb.");
  }
  return text;
}

function validateRuntimeEnvironment() {
  const requiredVariables = [
    "DATABASE_URL",
    "JWT_SECRET",
    "FORECAST_WORKER_API_KEY",
  ];
  const missing = requiredVariables.filter(
    (variableName) => !process.env[variableName]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(`Environment backend belum lengkap: ${missing.join(", ")}`);
  }

  getJwtSecret();
  getForecastWorkerApiKey();
  getCorsAllowedOrigins();

  readPositiveIntegerEnv("LOGIN_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, {
    minimum: 1000,
    maximum: 24 * 60 * 60 * 1000,
  });
  readPositiveIntegerEnv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5, {
    minimum: 1,
    maximum: 100,
  });
  readPositiveIntegerEnv("LOGIN_RATE_LIMIT_BLOCK_MS", 15 * 60 * 1000, {
    minimum: 1000,
    maximum: 24 * 60 * 60 * 1000,
  });
  readPercentageEnv("FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT", 5);
  readPercentageEnv("FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT", 1);
  validateBodyLimit(process.env.JSON_BODY_LIMIT || "1mb");
}

function getLoginRateLimitConfig() {
  return {
    windowMs: readPositiveIntegerEnv(
      "LOGIN_RATE_LIMIT_WINDOW_MS",
      15 * 60 * 1000,
      { minimum: 1000, maximum: 24 * 60 * 60 * 1000 },
    ),
    maxAttempts: readPositiveIntegerEnv(
      "LOGIN_RATE_LIMIT_MAX_ATTEMPTS",
      5,
      { minimum: 1, maximum: 100 },
    ),
    blockMs: readPositiveIntegerEnv(
      "LOGIN_RATE_LIMIT_BLOCK_MS",
      15 * 60 * 1000,
      { minimum: 1000, maximum: 24 * 60 * 60 * 1000 },
    ),
  };
}

module.exports = {
  getCorsAllowedOrigins,
  getForecastWorkerApiKey,
  getJwtSecret,
  getLoginRateLimitConfig,
  isPlaceholderSecret,
  normalizeOrigin,
  readPercentageEnv,
  readPositiveIntegerEnv,
  validateBodyLimit,
  validateRuntimeEnvironment,
};
