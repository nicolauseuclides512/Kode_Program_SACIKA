const PLACEHOLDER_SECRET_PATTERNS = [
  /^replace[_-]?with/i,
  /^your[_-]?/i,
  /^change[_-]?me/i,
  /^changeme$/i,
  /^development[_-]?secret/i,
  /^jwt[_-]?secret$/i,
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

function isPlaceholderSecret(secret) {
  const value = String(secret || "").trim();
  return PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET belum diatur pada environment backend.");
  }

  if (secret.length < 32) {
    throw new Error("JWT_SECRET minimal 32 karakter.");
  }

  if (isPlaceholderSecret(secret)) {
    throw new Error("JWT_SECRET masih menggunakan nilai contoh atau placeholder.");
  }

  return secret;
}

function validateRuntimeEnvironment() {
  const requiredVariables = ["DATABASE_URL", "JWT_SECRET"];
  const missing = requiredVariables.filter(
    (variableName) => !process.env[variableName]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(`Environment backend belum lengkap: ${missing.join(", ")}`);
  }

  getJwtSecret();

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
  getJwtSecret,
  getLoginRateLimitConfig,
  isPlaceholderSecret,
  readPositiveIntegerEnv,
  validateRuntimeEnvironment,
};
