const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCorsAllowedOrigins,
  getForecastWorkerApiKey,
  getJwtSecret,
  getLoginRateLimitConfig,
  isPlaceholderSecret,
  validateRuntimeEnvironment,
} = require("../config/security");

function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const STRONG_JWT = "4b2fd969f8cb9f07490e3a269e8fd6c73dff13c44f1e74c1";
const STRONG_WORKER_KEY = "1f9b37c1d4d3470ea2b4850242a6f64e";

test("JWT secret rejects missing, short, and placeholder values", () => {
  withEnv({ JWT_SECRET: undefined }, () => {
    assert.throws(() => getJwtSecret(), /belum diatur/);
  });

  withEnv({ JWT_SECRET: "terlalu-pendek" }, () => {
    assert.throws(() => getJwtSecret(), /minimal 32 karakter/);
  });

  withEnv({ JWT_SECRET: "replace_with_a_long_random_secret_at_least_32_characters" }, () => {
    assert.throws(() => getJwtSecret(), /placeholder/);
  });
});

test("JWT secret accepts a strong non-placeholder value", () => {
  withEnv({ JWT_SECRET: STRONG_JWT }, () => {
    assert.equal(getJwtSecret(), STRONG_JWT);
  });
});

test("worker API key is required and must be strong", () => {
  withEnv({ FORECAST_WORKER_API_KEY: undefined }, () => {
    assert.throws(() => getForecastWorkerApiKey(), /belum diatur/);
  });
  withEnv({ FORECAST_WORKER_API_KEY: "short" }, () => {
    assert.throws(() => getForecastWorkerApiKey(), /minimal 32 karakter/);
  });
  withEnv({ FORECAST_WORKER_API_KEY: STRONG_WORKER_KEY }, () => {
    assert.equal(getForecastWorkerApiKey(), STRONG_WORKER_KEY);
  });
});

test("runtime validation checks database, secrets, CORS, and rate-limit numbers", () => {
  withEnv({
    DATABASE_URL: "postgresql://localhost/sacika",
    JWT_SECRET: STRONG_JWT,
    FORECAST_WORKER_API_KEY: STRONG_WORKER_KEY,
    CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: "0",
  }, () => {
    assert.throws(() => validateRuntimeEnvironment(), /LOGIN_RATE_LIMIT_MAX_ATTEMPTS/);
  });
});

test("login rate-limit config reads valid environment values", () => {
  withEnv({
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: "4",
    LOGIN_RATE_LIMIT_BLOCK_MS: "120000",
  }, () => {
    assert.deepEqual(getLoginRateLimitConfig(), {
      windowMs: 60000,
      maxAttempts: 4,
      blockMs: 120000,
    });
  });
});

test("CORS origins are read from env, deduplicated, and wildcard is rejected", () => {
  withEnv({
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "http://localhost:5173,https://sacika.example,http://localhost:5173",
  }, () => {
    assert.deepEqual(getCorsAllowedOrigins(), [
      "http://localhost:5173",
      "https://sacika.example",
    ]);
  });

  withEnv({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "*" }, () => {
    assert.throws(() => getCorsAllowedOrigins(), /wildcard/);
  });
});

test("placeholder detector only flags known example values", () => {
  assert.equal(isPlaceholderSecret("changeme"), true);
  assert.equal(isPlaceholderSecret("your_secret_that_is_long_enough_123456"), true);
  assert.equal(isPlaceholderSecret("a9af6e53b3b4e183bcb253bdf532433f"), false);
});
