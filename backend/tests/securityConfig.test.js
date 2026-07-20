const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
  const secret = "4b2fd969f8cb9f07490e3a269e8fd6c73dff13c44f1e74c1";
  withEnv({ JWT_SECRET: secret }, () => {
    assert.equal(getJwtSecret(), secret);
  });
});

test("runtime validation checks database, JWT, and rate-limit numbers", () => {
  withEnv({
    DATABASE_URL: "postgresql://localhost/sacika",
    JWT_SECRET: "4b2fd969f8cb9f07490e3a269e8fd6c73dff13c44f1e74c1",
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

test("placeholder detector only flags known example values", () => {
  assert.equal(isPlaceholderSecret("changeme"), true);
  assert.equal(isPlaceholderSecret("your_secret_that_is_long_enough_123456"), true);
  assert.equal(isPlaceholderSecret("a9af6e53b3b4e183bcb253bdf532433f"), false);
});
