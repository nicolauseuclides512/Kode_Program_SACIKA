const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePeriod, periodBounds, trend } = require("../services/dashboardService");

test("dashboard period parser validates YYYY-MM and creates previous-month bounds", () => {
  assert.equal(parsePeriod("2026-07"), "2026-07");
  assert.throws(() => parsePeriod("07-2026"), /YYYY-MM/);
  assert.deepEqual(periodBounds("2026-01"), {
    period: "2026-01",
    start: "2026-01-01",
    end: "2026-02-01",
    previous_start: "2025-12-01",
    previous_period: "2025-12",
  });
});

test("dashboard trend handles normal and zero baselines", () => {
  assert.equal(trend(120, 100), 20);
  assert.equal(trend(0, 0), 0);
  assert.equal(trend(10, 0), null);
});
