import unittest

from forecasting.selector import (
    _is_better_candidate,
    _warning_messages,
    generate_future_periods,
)


def candidate(mae, rmse):
    return {
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
    def test_generate_future_periods(self):
        self.assertEqual(
            generate_future_periods("2025-12", 3),
            ["2026-01", "2026-02", "2026-03"],
        )

    def test_mae_is_primary_selection_metric(self):
        self.assertTrue(_is_better_candidate(candidate(1.0, 10.0), candidate(2.0, 1.0)))

    def test_rmse_breaks_very_close_mae_tie(self):
        self.assertTrue(_is_better_candidate(candidate(1.0, 2.0), candidate(1.0, 3.0)))
        self.assertFalse(_is_better_candidate(candidate(1.0, 4.0), candidate(1.0, 3.0)))

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
