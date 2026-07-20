import unittest

from forecasting.selector import handle_prediction_request
from forecasting.validation import PayloadValidationError, validate_prediction_payload


class MonthlySalesTargetValidationTest(unittest.TestCase):
    def _payload(self, count=12):
        periods = []
        year, month = 2025, 1
        for _ in range(count):
            periods.append(f"{year}-{month:02d}")
            month += 1
            if month == 13:
                year += 1
                month = 1
        return {
            "product_id": 1,
            "target": "monthly_sales",
            "frequency": "monthly",
            "periods": periods,
            "values": list(range(1, count + 1)),
            "horizon": 1,
        }

    def test_monthly_sales_accepts_twelve_complete_months(self):
        result = validate_prediction_payload(self._payload(12))
        self.assertEqual(result["target"], "monthly_sales")
        self.assertEqual(result["observation_count"], 12)

    def test_monthly_sales_rejects_less_than_twelve_months(self):
        with self.assertRaises(PayloadValidationError) as context:
            validate_prediction_payload(self._payload(11))
        self.assertTrue(any("minimal 12" in error for error in context.exception.errors))

    def test_monthly_sales_twelve_months_can_be_evaluated(self):
        result = handle_prediction_request(self._payload(12))
        self.assertEqual(result["target"], "monthly_sales")
        self.assertGreater(result["evaluation"]["test_points"], 0)


if __name__ == "__main__":
    unittest.main()
