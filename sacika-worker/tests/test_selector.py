import os
import unittest

from forecasting.selector import (
    _apply_naive_guard,
    _is_better_candidate,
    _warning_messages,
    generate_future_periods,
)


def candidate(mae, rmse, display_name="SES"):
    return {
        "display_name": display_name,
        "evaluation": {
            "status": "success",
            "metrics": {
                "mae": mae,
                "rmse": rmse,
                "wape": 0.0,
            },
        },
    }


class SelectorTest(unittest.TestCase):
    def setUp(self):
        self.previous_min_improvement = os.environ.get(
            "FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT"
        )
        self.previous_tolerance = os.environ.get(
            "FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT"
        )
        os.environ["FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT"] = "5"
        os.environ["FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT"] = "1"

    def tearDown(self):
        if self.previous_min_improvement is None:
            os.environ.pop("FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT", None)
        else:
            os.environ["FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT"] = (
                self.previous_min_improvement
            )

        if self.previous_tolerance is None:
            os.environ.pop("FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT", None)
        else:
            os.environ["FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT"] = (
                self.previous_tolerance
            )

    def test_generate_future_periods(self):
        self.assertEqual(
            generate_future_periods("2025-12", 3),
            ["2026-01", "2026-02", "2026-03"],
        )

    def test_mae_is_primary_selection_metric(self):
        self.assertTrue(
            _is_better_candidate(
                candidate(1.0, 10.0),
                candidate(2.0, 1.0, "Naive"),
            )
        )

    def test_relative_tolerance_uses_rmse_and_prefers_simpler_model_when_tied(self):
        # Selisih MAE 0,5% dianggap tie pada toleransi 1%.
        self.assertTrue(
            _is_better_candidate(
                candidate(99.5, 90.0, "SES"),
                candidate(100.0, 100.0, "Naive"),
            )
        )
        self.assertFalse(
            _is_better_candidate(
                candidate(99.5, 100.0, "SES"),
                candidate(100.0, 100.0, "Naive"),
            )
        )

    def test_naive_guard_keeps_naive_when_improvement_is_below_five_percent(self):
        naive = candidate(100.0, 100.0, "Naive")
        challenger = candidate(96.0, 95.0, "SES")
        selected, metadata = _apply_naive_guard(
            [naive, challenger],
            challenger,
        )

        self.assertIs(selected, naive)
        self.assertEqual(metadata["policy"], "naive_minimum_improvement_guard")
        self.assertEqual(metadata["improvement_over_naive_pct"], 4.0)

    def test_naive_guard_accepts_model_with_meaningful_improvement(self):
        naive = candidate(100.0, 100.0, "Naive")
        challenger = candidate(90.0, 92.0, "SES")
        selected, metadata = _apply_naive_guard(
            [naive, challenger],
            challenger,
        )

        self.assertIs(selected, challenger)
        self.assertEqual(metadata["policy"], "challenger_exceeds_naive_threshold")
        self.assertEqual(metadata["improvement_over_naive_pct"], 10.0)

    def test_warning_messages_cover_missing_zero_ratio_and_short_history(self):
        validated_payload = {
            "missing_observation_count": 1,
        }
        warnings = _warning_messages(
            validated_payload,
            [0.0] * 12 + [5.0] * 6,
            [5.0],
        )

        self.assertIn("Observasi valid kurang dari 24 bulan", warnings)
        self.assertIn("Terdapat bulan hilang pada histori", warnings)
        self.assertIn("Rasio nilai nol tinggi", warnings)

    def test_warning_messages_detect_far_forecast_without_changing_value(self):
        warnings = _warning_messages(
            {"missing_observation_count": 0},
            [10.0] * 24,
            [30.0],
        )

        self.assertEqual(warnings, ["Nilai prediksi berada jauh di luar rentang historis"])


if __name__ == "__main__":
    unittest.main()
