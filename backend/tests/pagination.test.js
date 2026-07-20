const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPaginationMeta,
  paginatedResponse,
  parseBooleanQuery,
  parsePagination,
} = require("../utils/pagination");

test("parsePagination validates page, caps limit, and computes offset", () => {
  assert.deepEqual(parsePagination({ page: "3", limit: "500", search: " kopi " }), {
    page: 3,
    limit: 100,
    offset: 200,
    search: "kopi",
  });
  assert.throws(() => parsePagination({ page: "0" }), /page/);
});

test("pagination response contains stable metadata", () => {
  assert.deepEqual(createPaginationMeta({ page: 2, limit: 10, total: 25 }), {
    page: 2,
    limit: 10,
    total: 25,
    total_pages: 3,
    has_previous: true,
    has_next: true,
  });
  assert.equal(paginatedResponse([{ id: 1 }], { page: 1, limit: 10, total: 1 }).data.length, 1);
});

test("parseBooleanQuery accepts explicit booleans and rejects ambiguity", () => {
  assert.equal(parseBooleanQuery("true"), true);
  assert.equal(parseBooleanQuery("0"), false);
  assert.throws(() => parseBooleanQuery("yes"), /boolean/);
});
