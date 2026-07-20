BEGIN;

ALTER TABLE forecast_result
  ADD COLUMN produk_id INTEGER,
  ADD COLUMN target TEXT,
  ADD COLUMN model_used TEXT,
  ADD COLUMN data_cutoff DATE,
  ADD COLUMN mae NUMERIC(14, 4),
  ADD COLUMN rmse NUMERIC(14, 4),
  ADD COLUMN wape NUMERIC(14, 4),
  ADD COLUMN observation_count INTEGER,
  ADD COLUMN warning TEXT;

UPDATE forecast_result result
SET
  produk_id = run.produk_id,
  target = run.target,
  model_used = run.model_used,
  data_cutoff = run.data_cutoff,
  mae = run.mae,
  rmse = run.rmse,
  wape = run.wape,
  observation_count = run.observation_count,
  warning = run.warning
FROM forecast_run run
WHERE run.id = result.forecast_run_id;

ALTER TABLE forecast_result
  ALTER COLUMN produk_id SET NOT NULL,
  ALTER COLUMN target SET NOT NULL,
  ALTER COLUMN model_used SET NOT NULL,
  ALTER COLUMN data_cutoff SET NOT NULL,
  ALTER COLUMN observation_count SET NOT NULL;

ALTER TABLE forecast_result
  ADD CONSTRAINT chk_forecast_result_target_not_empty
    CHECK (BTRIM(target) <> ''),
  ADD CONSTRAINT chk_forecast_result_model_used_not_empty
    CHECK (BTRIM(model_used) <> ''),
  ADD CONSTRAINT chk_forecast_result_mae_nonnegative
    CHECK (mae IS NULL OR mae >= 0),
  ADD CONSTRAINT chk_forecast_result_rmse_nonnegative
    CHECK (rmse IS NULL OR rmse >= 0),
  ADD CONSTRAINT chk_forecast_result_wape_nonnegative
    CHECK (wape IS NULL OR wape >= 0),
  ADD CONSTRAINT chk_forecast_result_observation_count_nonnegative
    CHECK (observation_count >= 0);

DROP TABLE IF EXISTS forecast_backtest;

DROP INDEX IF EXISTS idx_forecast_result_pending_evaluation;
DROP INDEX IF EXISTS idx_forecast_result_run_period;
DROP INDEX IF EXISTS uq_forecast_result_run_period;
DROP INDEX IF EXISTS uq_forecast_run_current_per_target;
DROP INDEX IF EXISTS idx_forecast_run_latest;

ALTER TABLE forecast_result
  DROP CONSTRAINT IF EXISTS fk_forecast_result_run,
  DROP CONSTRAINT IF EXISTS chk_forecast_result_interval,
  DROP CONSTRAINT IF EXISTS chk_forecast_result_actual_nonnegative,
  DROP CONSTRAINT IF EXISTS chk_forecast_result_realized_errors_nonnegative,
  DROP COLUMN forecast_run_id,
  DROP COLUMN lower_bound,
  DROP COLUMN upper_bound,
  DROP COLUMN actual_value,
  DROP COLUMN absolute_error,
  DROP COLUMN squared_error,
  DROP COLUMN absolute_percentage_error,
  DROP COLUMN evaluated_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_result_produk_cutoff_period_model
  ON forecast_result (produk_id, data_cutoff, forecast_period, model_used);

CREATE INDEX IF NOT EXISTS idx_forecast_result_latest
  ON forecast_result (produk_id, target, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecast_result_produk_period
  ON forecast_result (produk_id, target, forecast_period DESC);

DROP TRIGGER IF EXISTS trg_forecast_run_updated_at ON forecast_run;
DROP TABLE IF EXISTS forecast_run;

COMMIT;
