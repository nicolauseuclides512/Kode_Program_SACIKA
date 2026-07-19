import json
import unittest

from app import app


def valid_payload():
    periods = []
    values = []

    year = 2024
    month = 1
    for index in range(24):
        periods.append(f"{year}-{month:02d}")
        values.append(100 - index)
        month += 1
        if month > 12:
            month = 1
            year += 1

    return {
        "product_id": 1,
        "target": "ending_inventory",
        "frequency": "monthly",
        "periods": periods,
        "values": values,
        "horizon": 1,
    }


class PredictEndpointTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_predict_accepts_valid_direct_series_payload(self):
        response = self.client.post("/predict", json=valid_payload())

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["product_id"], 1)
        self.assertEqual(body["target"], "ending_inventory")
        self.assertEqual(body["frequency"], "monthly")
        self.assertIn(body["model_used"], {"Naive", "SES", "Damped Holt", "ARIMA"})
        self.assertEqual(body["forecast_periods"], ["2026-01"])
        self.assertEqual(len(body["forecast_values"]), 1)
        self.assertEqual(body["evaluation"]["test_points"], 6)
        self.assertEqual(len(body["candidate_models"]), 4)
        json.dumps(body["candidate_models"])
        self.assertEqual(len(body["backtest"]), 6)
        self.assertIn("actual", body["backtest"][0])
        self.assertIn("predicted", body["backtest"][0])

    def test_predict_rejects_legacy_produk_id_payload(self):
        response = self.client.post("/predict", json={
            "produk_id": 1,
            "minggu": 1,
        })

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertEqual(body["status"], "invalid")
        self.assertIn("product_id wajib berupa integer positif", body["errors"])

    def test_predict_rejects_mismatched_lengths(self):
        payload = valid_payload()
        payload["values"] = payload["values"][:-1]

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("panjang periods dan values harus sama", body["errors"])

    def test_predict_rejects_negative_values(self):
        payload = valid_payload()
        payload["values"][3] = -1

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("values[3] tidak boleh negatif", body["errors"])

    def test_predict_rejects_less_than_eighteen_valid_observations(self):
        payload = valid_payload()
        payload["periods"] = payload["periods"][:17]
        payload["values"] = payload["values"][:17]

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("observasi valid minimal 18, saat ini 17", body["errors"])

    def test_predict_rejects_non_consecutive_periods(self):
        payload = valid_payload()
        payload["periods"][5] = "2025-12"

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("periods harus berurutan bulanan tanpa loncatan", body["errors"])

    def test_predict_counts_null_as_missing_without_filling_zero(self):
        payload = valid_payload()
        payload["values"][0] = None

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertIsNotNone(body["warning"])
        self.assertIn("Terdapat bulan hilang pada histori", body["warning"])
        json.dumps(body["candidate_models"])

    def test_predict_rejects_horizon_above_temporary_limit(self):
        payload = valid_payload()
        payload["horizon"] = 4

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("horizon maksimum sementara adalah 3 bulan", body["errors"])

    def test_predict_defaults_horizon_to_one_month(self):
        payload = valid_payload()
        del payload["horizon"]

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["forecast_periods"], ["2026-01"])


if __name__ == "__main__":
    unittest.main()
