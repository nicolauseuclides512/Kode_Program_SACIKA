import unittest

from forecasting.models import (
    ALLOWED_ARIMA_ORDERS,
    _clean_predictions,
    arima_candidate_forecasts,
    arima_forecast,
    damped_holt_forecast,
    naive_forecast,
    single_exponential_smoothing_forecast,
)


class ForecastingModelTest(unittest.TestCase):
    def test_stable_data_forecasts_are_deterministic(self):
        training = [10.0] * 24

        naive = naive_forecast(training, 3)
        ses_first = single_exponential_smoothing_forecast(training, 3)
        ses_second = single_exponential_smoothing_forecast(training, 3)

        self.assertEqual(naive["status"], "success")
        self.assertEqual(naive["predictions"], [10.0, 10.0, 10.0])
        self.assertEqual(ses_first["status"], "success")
        self.assertEqual(
            [round(value, 6) for value in ses_first["predictions"]],
            [round(value, 6) for value in ses_second["predictions"]],
        )
        self.assertTrue(all(value >= 0 for value in ses_first["predictions"]))

    def test_trend_data_damped_holt_returns_positive_forecast(self):
        training = [10 + (index * 2) for index in range(24)]

        result = damped_holt_forecast(training, 2)

        self.assertEqual(result["status"], "success")
        self.assertEqual(len(result["predictions"]), 2)
        self.assertTrue(all(value >= 0 for value in result["predictions"]))

    def test_arima_uses_only_allowed_orders_and_stores_aic_as_metadata(self):
        training = [10 + index for index in range(24)]

        candidate_results = arima_candidate_forecasts(training, 1)
        allowed_order_results = [
            result["metadata"].get("order")
            for result in candidate_results
        ]
        one_order_result = arima_forecast(training, 1, order=(1, 0, 0))
        disallowed_order_result = arima_forecast(training, 1, order=(2, 1, 2))

        self.assertEqual(
            allowed_order_results,
            [list(order) for order in ALLOWED_ARIMA_ORDERS],
        )
        self.assertIn(one_order_result["status"], {"success", "failed"})
        if one_order_result["status"] == "success":
            self.assertIn("aic", one_order_result["metadata"])
        self.assertEqual(disallowed_order_result["status"], "failed")

    def test_short_data_fails_per_model_without_raising(self):
        self.assertEqual(naive_forecast([], 1)["status"], "failed")
        self.assertEqual(
            single_exponential_smoothing_forecast([1.0], 1)["status"],
            "failed",
        )
        self.assertEqual(damped_holt_forecast([1.0, 2.0], 1)["status"], "failed")
        self.assertEqual(arima_forecast([1.0, 2.0, 3.0], 1)["status"], "failed")

    def test_negative_predictions_are_floored_to_zero(self):
        self.assertEqual(_clean_predictions([-3.0, 0.0, 2.5]), [0.0, 0.0, 2.5])


if __name__ == "__main__":
    unittest.main()
