BEGIN;

CREATE TABLE IF NOT EXISTS forecast_run (
  id BIGSERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
  target TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  model_used TEXT NOT NULL,
  data_cutoff DATE NOT NULL,
  mae NUMERIC(14, 4),
  rmse NUMERIC(14, 4),
  wape NUMERIC(14, 4),
  test_points INTEGER NOT NULL DEFAULT 0,
  observation_count INTEGER NOT NULL DEFAULT 0,
  candidate_models JSONB NOT NULL DEFAULT '[]'::JSONB,
  warning TEXT,
  status TEXT NOT NULL DEFAULT 'current',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_forecast_run_target_not_empty CHECK (BTRIM(target) <> ''),
  CONSTRAINT chk_forecast_run_frequency CHECK (frequency IN ('monthly')),
  CONSTRAINT chk_forecast_run_model_not_empty CHECK (BTRIM(model_used) <> ''),
  CONSTRAINT chk_forecast_run_metrics_nonnegative CHECK (
    (mae IS NULL OR mae >= 0)
    AND (rmse IS NULL OR rmse >= 0)
    AND (wape IS NULL OR wape >= 0)
  ),
  CONSTRAINT chk_forecast_run_counts_nonnegative CHECK (
    test_points >= 0 AND observation_count >= 0
  ),
  CONSTRAINT chk_forecast_run_candidate_models_array CHECK (
    JSONB_TYPEOF(candidate_models) = 'array'
  ),
  CONSTRAINT chk_forecast_run_status CHECK (
    status IN ('current', 'stale', 'superseded')
  ),
  CONSTRAINT uq_forecast_run_identity
    UNIQUE (produk_id, target, data_cutoff, model_used)
);

CREATE TRIGGER trg_forecast_run_updated_at
BEFORE UPDATE ON forecast_run
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO forecast_run (
  produk_id,
  target,
  frequency,
  model_used,
  data_cutoff,
  mae,
  rmse,
  wape,
  test_points,
  observation_count,
  candidate_models,
  warning,
  status,
  created_at,
  updated_at
)
SELECT
  produk_id,
  target,
  'monthly',
  model_used,
  data_cutoff,
  MAX(mae),
  MAX(rmse),
  MAX(wape),
  0,
  MAX(observation_count),
  '[]'::JSONB,
  MAX(warning),
  'superseded',
  MAX(created_at),
  MAX(created_at)
FROM forecast_result
GROUP BY produk_id, target, model_used, data_cutoff
ON CONFLICT (produk_id, target, data_cutoff, model_used) DO NOTHING;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY produk_id, target
      ORDER BY created_at DESC, data_cutoff DESC, id DESC
    ) AS row_number
  FROM forecast_run
)
UPDATE forecast_run fr
SET status = CASE WHEN ranked.row_number = 1 THEN 'current' ELSE 'superseded' END
FROM ranked
WHERE ranked.id = fr.id;

ALTER TABLE forecast_result
  ADD COLUMN IF NOT EXISTS forecast_run_id BIGINT,
  ADD COLUMN IF NOT EXISTS lower_bound NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS upper_bound NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS actual_value NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS absolute_error NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS squared_error NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS absolute_percentage_error NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ;

UPDATE forecast_result result
SET forecast_run_id = run.id
FROM forecast_run run
WHERE run.produk_id = result.produk_id
  AND run.target = result.target
  AND run.data_cutoff = result.data_cutoff
  AND run.model_used = result.model_used
  AND result.forecast_run_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM forecast_result WHERE forecast_run_id IS NULL) THEN
    RAISE EXCEPTION 'Tidak semua forecast_result dapat dipetakan ke forecast_run';
  END IF;
END;
$$;

ALTER TABLE forecast_result
  ALTER COLUMN forecast_run_id SET NOT NULL;

ALTER TABLE forecast_result
  ADD CONSTRAINT fk_forecast_result_run
    FOREIGN KEY (forecast_run_id) REFERENCES forecast_run(id) ON DELETE CASCADE,
  ADD CONSTRAINT chk_forecast_result_interval CHECK (
    (lower_bound IS NULL OR lower_bound >= 0)
    AND (upper_bound IS NULL OR upper_bound >= 0)
    AND (lower_bound IS NULL OR upper_bound IS NULL OR upper_bound >= lower_bound)
  ),
  ADD CONSTRAINT chk_forecast_result_actual_nonnegative CHECK (
    actual_value IS NULL OR actual_value >= 0
  ),
  ADD CONSTRAINT chk_forecast_result_realized_errors_nonnegative CHECK (
    (absolute_error IS NULL OR absolute_error >= 0)
    AND (squared_error IS NULL OR squared_error >= 0)
    AND (absolute_percentage_error IS NULL OR absolute_percentage_error >= 0)
  );

DROP INDEX IF EXISTS uq_forecast_result_produk_cutoff_period_model;
DROP INDEX IF EXISTS idx_forecast_result_latest;
DROP INDEX IF EXISTS idx_forecast_result_produk_period;

ALTER TABLE forecast_result
  DROP COLUMN produk_id,
  DROP COLUMN target,
  DROP COLUMN model_used,
  DROP COLUMN data_cutoff,
  DROP COLUMN mae,
  DROP COLUMN rmse,
  DROP COLUMN wape,
  DROP COLUMN observation_count,
  DROP COLUMN warning;

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_result_run_period
  ON forecast_result (forecast_run_id, forecast_period);

CREATE INDEX IF NOT EXISTS idx_forecast_result_run_period
  ON forecast_result (forecast_run_id, forecast_period ASC);

CREATE INDEX IF NOT EXISTS idx_forecast_result_pending_evaluation
  ON forecast_result (forecast_period)
  WHERE actual_value IS NULL;

CREATE INDEX IF NOT EXISTS idx_forecast_run_latest
  ON forecast_run (produk_id, target, created_at DESC, data_cutoff DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_run_current_per_target
  ON forecast_run (produk_id, target)
  WHERE status = 'current';

CREATE TABLE IF NOT EXISTS forecast_backtest (
  id BIGSERIAL PRIMARY KEY,
  forecast_run_id BIGINT NOT NULL REFERENCES forecast_run(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  actual NUMERIC(14, 2) NOT NULL,
  predicted NUMERIC(14, 2) NOT NULL,
  absolute_error NUMERIC(14, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_forecast_backtest_run_period UNIQUE (forecast_run_id, period),
  CONSTRAINT chk_forecast_backtest_period_awal_bulan
    CHECK (period = DATE_TRUNC('month', period)::DATE),
  CONSTRAINT chk_forecast_backtest_values_nonnegative CHECK (
    actual >= 0 AND predicted >= 0 AND absolute_error >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_forecast_backtest_run_period
  ON forecast_backtest (forecast_run_id, period ASC);

COMMIT;
