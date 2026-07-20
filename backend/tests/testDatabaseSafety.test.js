const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDatabaseName,
  requireTestDatabaseUrl,
} = require("./database/helpers");

test("nama database dibaca dari PostgreSQL URL", () => {
  assert.equal(
    parseDatabaseName("postgresql://postgres:secret@localhost:5432/sacika_test"),
    "sacika_test",
  );
});

test("test database wajib terpisah dan mengandung kata test", () => {
  assert.throws(() => requireTestDatabaseUrl({}), /TEST_DATABASE_URL/);
  assert.throws(
    () => requireTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://x/y/sacika" }),
    /kata 'test'/,
  );
  assert.throws(
    () => requireTestDatabaseUrl({
      TEST_DATABASE_URL: "postgresql://u:p@localhost/sacika_test",
      DATABASE_URL: "postgresql://u:p@localhost/sacika_test",
    }),
    /tidak boleh sama/,
  );
});
