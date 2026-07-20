const test = require("node:test");
const assert = require("node:assert/strict");

const { translateDatabaseError } = require("../utils/databaseErrors");

test("foreign key conflict diterjemahkan menjadi 409 tanpa detail SQL", () => {
  const original = Object.assign(new Error("internal SQL detail"), {
    code: "23503",
    detail: "Key (id) is still referenced",
  });
  const translated = translateDatabaseError(original, {
    referenceMessage: "Data masih digunakan",
    referenceCode: "DATA_STILL_IN_USE",
  });

  assert.equal(translated.statusCode, 409);
  assert.equal(translated.code, "DATA_STILL_IN_USE");
  assert.equal(translated.message, "Data masih digunakan");
});

test("duplicate menjadi 409 dan check constraint menjadi 400", () => {
  const duplicate = translateDatabaseError({ code: "23505" });
  const constraint = translateDatabaseError({ code: "23514" });

  assert.equal(duplicate.statusCode, 409);
  assert.equal(constraint.statusCode, 400);
});
