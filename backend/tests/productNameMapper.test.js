const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProductName,
} = require("../services/productNameMapper");

test("normalizeProductName normalizes volume unit spacing", () => {
  assert.equal(normalizeProductName("Aqua Botol 600ml"), "aqua botol 600 ml");
  assert.equal(normalizeProductName("Aqua Botol 600 ml"), "aqua botol 600 ml");
});

test("normalizeProductName normalizes gram spelling", () => {
  assert.equal(normalizeProductName("COFFEMIX   20 GR"), "coffemix 20 g");
  assert.equal(normalizeProductName("Coffemix 20 g"), "coffemix 20 g");
});

test("normalizeProductName trims and collapses repeated spaces", () => {
  assert.equal(
    normalizeProductName("  Aqua    Botol    600ml  "),
    "aqua botol 600 ml",
  );
});

test("normalizeProductName handles different capitalization", () => {
  assert.equal(normalizeProductName("aQuA boToL 600ML"), "aqua botol 600 ml");
});

test("normalizeProductName removes unnecessary characters but keeps sizes", () => {
  assert.equal(normalizeProductName("Aqua Botol (600ml)!"), "aqua botol 600 ml");
});
