const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateProductQuality,
  deriveExpectedPeriods,
  findContiguousSegments,
  findLatestContiguousSegment,
} = require("../services/inventoryHistoryQualityService");
const {
  InventoryForecastError,
  selectForecastTrainingHistory,
} = require("../services/inventoryForecastService");

function months(startYear, startMonth, count) {
  const periods = [];
  let year = startYear;
  let month = startMonth;

  for (let index = 0; index < count; index += 1) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return periods;
}

test("findContiguousSegments preserves gaps instead of compressing time", () => {
  const periods = months(2024, 1, 6);
  const segments = findContiguousSegments(periods, [10, 9, null, 8, 7, 6]);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].periods, ["2024-01", "2024-02"]);
  assert.deepEqual(segments[1].periods, ["2024-04", "2024-05", "2024-06"]);
  assert.equal(findLatestContiguousSegment(periods, [10, 9, null, 8, 7, 6]).observation_count, 3);
});

test("selectForecastTrainingHistory uses only the latest continuous monthly segment", () => {
  const periods = months(2023, 1, 24);
  const values = periods.map((_, index) => index + 1);
  values[4] = null;

  const training = selectForecastTrainingHistory({
    periods,
    values,
    observation_count: 23,
    missing_periods: [periods[4]],
  }, 18);

  assert.equal(training.observation_count, 19);
  assert.equal(training.training_period_start, "2023-06");
  assert.equal(training.training_period_end, "2024-12");
  assert.equal(training.values.includes(null), false);
});

test("selectForecastTrainingHistory rejects scattered data when latest segment is too short", () => {
  const periods = months(2023, 1, 24);
  const values = periods.map((_, index) => index + 1);
  values[6] = null;

  assert.throws(
    () => selectForecastTrainingHistory({ periods, values }, 18),
    (error) => {
      assert.equal(error instanceof InventoryForecastError, true);
      assert.equal(error.statusCode, 422);
      assert.equal(error.details.latest_contiguous_observation_count, 17);
      return true;
    },
  );
});

test("deriveExpectedPeriods follows actual data range beyond 2024-2025", () => {
  const rows = [
    { periode: "2025-11-01", stok_akhir: 1, status_data: "observed" },
    { periode: "2026-02-01", stok_akhir: 2, status_data: "observed" },
  ];

  assert.deepEqual(
    deriveExpectedPeriods({ id: 1 }, rows),
    ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"],
  );
});

test("dynamic quality window can use the latest rolling months", () => {
  const rows = months(2024, 1, 30).map((period, index) => ({
    periode: `${period}-01`,
    stok_akhir: index,
    status_data: "observed",
  }));

  const quality = calculateProductQuality(
    { id: 1, nama_produk: "Produk", is_active: true },
    rows,
    [],
    { windowMonths: 24, minObservationCount: 18 },
  );

  assert.equal(quality.expected_period_count, 24);
  assert.equal(quality.quality_window_start, "2024-07-01");
  assert.equal(quality.quality_window_end, "2026-06-01");
  assert.equal(quality.latest_contiguous_observation_count, 24);
  assert.equal(quality.eligible, true);
});
