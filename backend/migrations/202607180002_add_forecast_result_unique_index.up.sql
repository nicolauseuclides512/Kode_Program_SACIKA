BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_result_produk_cutoff_period_model
  ON forecast_result (produk_id, data_cutoff, forecast_period, model_used);

COMMIT;
