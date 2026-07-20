import unittest

from forecasting.metrics import rolling_origin_validation
from forecasting.models import naive_forecast


class RollingOriginValidationTest(unittest.TestCase):
    def test_stable_data_has_zero_error(self):
        values = [10.0] * 24

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["fold_count"], 6)
        self.assertEqual(result["metrics"]["mae"], 0.0)
        self.assertEqual(result["metrics"]["rmse"], 0.0)
        self.assertEqual(result["metrics"]["wape"], 0.0)
        self.assertEqual(
            [fold["actual"] for fold in result["folds"]],
            [10.0] * 6,
        )
        self.assertEqual(
            [fold["predicted"] for fold in result["folds"]],
            [10.0] * 6,
        )

    def test_trend_data_keeps_all_six_folds(self):
        values = [index + 1 for index in range(24)]

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["fold_count"], 6)
        self.assertEqual(result["metrics"]["mae"], 1.0)
        self.assertEqual(result["metrics"]["rmse"], 1.0)
        self.assertEqual(result["folds"][0]["actual"], 19)
        self.assertEqual(result["folds"][0]["predicted"], 18.0)
        self.assertEqual(result["folds"][-1]["actual"], 24)
        self.assertEqual(result["folds"][-1]["predicted"], 23.0)

    def test_test_values_are_kept_raw_without_clipping_or_winsorizing(self):
        values = [10.0] * 18 + [10_000.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        original = list(values)

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["folds"][0]["actual"], 10_000.0)
        self.assertEqual(values, original)
        self.assertEqual(
            result["evaluation_policy"]["test_value_transformation"],
            "none",
        )

    def test_model_receives_immutable_training_copy(self):
        received_types = []

        def inspect_training(training, horizon):
            received_types.append(type(training))
            return {
                "status": "success",
                "model": "inspection_model",
                "predictions": [training[-1]],
                "error": None,
            }

        result = rolling_origin_validation([10.0] * 24, inspect_training)
        self.assertEqual(result["status"], "success")
        self.assertTrue(all(item is tuple for item in received_types))

    def test_actuals_with_zero_use_wape_denominator_from_all_actuals(self):
        values = [5.0] * 18 + [0.0, 5.0, 0.0, 5.0, 0.0, 5.0]

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["fold_count"], 6)
        self.assertIsNotNone(result["metrics"]["wape"])
        self.assertEqual(result["folds"][0]["actual"], 0.0)
        self.assertEqual(result["folds"][0]["predicted"], 5.0)

    def test_all_actuals_zero_return_null_wape(self):
        values = [0.0] * 24

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["metrics"]["mae"], 0.0)
        self.assertEqual(result["metrics"]["rmse"], 0.0)
        self.assertIsNone(result["metrics"]["wape"])

    def test_less_than_minimum_training_fails(self):
        values = [10.0] * 18

        result = rolling_origin_validation(values, naive_forecast)

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["fold_count"], 0)
        self.assertIsNone(result["metrics"]["mae"])
        self.assertIn("minimum training", result["error"])

    def test_failed_fold_marks_model_failed_without_dropping_folds(self):
        def model_fails_on_second_fold(training, horizon):
            if len(training) == 19:
                return {
                    "status": "failed",
                    "model": "test_model",
                    "predictions": [],
                    "error": "simulated failure",
                }

            return {
                "status": "success",
                "model": "test_model",
                "predictions": [training[-1]],
                "error": None,
            }

        values = [10.0] * 24

        result = rolling_origin_validation(values, model_fails_on_second_fold)

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["fold_count"], 6)
        self.assertEqual(result["failed_fold_count"], 1)
        self.assertEqual(result["folds"][1]["status"], "failed")
        self.assertEqual(result["folds"][1]["predicted"], None)


if __name__ == "__main__":
    unittest.main()
