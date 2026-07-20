import json
import os
import unittest

TEST_WORKER_API_KEY = "test-worker-api-key-1234567890abcdef"
os.environ["FORECAST_WORKER_API_KEY"] = TEST_WORKER_API_KEY

from app import app  # noqa: E402


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
        os.environ["FORECAST_WORKER_API_KEY"] = TEST_WORKER_API_KEY
        self.headers = {"X-Worker-API-Key": TEST_WORKER_API_KEY}

    def post_predict(self, payload):
        return self.client.post("/predict", json=payload, headers=self.headers)

    def test_predict_rejects_missing_or_invalid_worker_api_key(self):
        missing = self.client.post("/predict", json=valid_payload())
        invalid = self.client.post(
            "/predict",
            json=valid_payload(),
            headers={"X-Worker-API-Key": "wrong-key"},
        )

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(invalid.status_code, 401)
        self.assertNotIn("FORECAST_WORKER_API_KEY", missing.get_data(as_text=True))

    def test_predict_returns_503_when_worker_key_is_not_configured(self):
        previous = os.environ.pop("FORECAST_WORKER_API_KEY", None)
        try:
            response = self.client.post(
                "/predict",
                json=valid_payload(),
                headers=self.headers,
            )
        finally:
            if previous is not None:
                os.environ["FORECAST_WORKER_API_KEY"] = previous

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["status"], "unavailable")

    def test_predict_accepts_valid_direct_series_payload(self):
        response = self.post_predict(valid_payload())

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["product_id"], 1)
        self.assertEqual(body["target"], "ending_inventory")
        self.assertEqual(body["frequency"], "monthly")
        self.assertIn(body["model_used"], {"Naive", "SES", "Damped Holt", "ARIMA"})
        self.assertEqual(body["forecast_periods"], ["2026-01"])
        self.assertEqual(len(body["forecast_values"]), 1)
        self.assertEqual(body["evaluation"]["test_points"], 6)
        self.assertEqual(
            body["evaluation"]["policy"]["test_value_transformation"],
            "none",
        )
        self.assertEqual(len(body["candidate_models"]), 4)
        self.assertEqual(
            len([item for item in body["candidate_models"] if item["selected"]]),
            1,
        )
        self.assertIn("minimum_improvement_required_pct", body["selection"])
        json.dumps(body["candidate_models"])
        self.assertEqual(len(body["backtest"]), 6)
        self.assertIn("actual", body["backtest"][0])
        self.assertIn("predicted", body["backtest"][0])

    def test_predict_rejects_legacy_produk_id_payload(self):
        response = self.post_predict({
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

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("panjang periods dan values harus sama", body["errors"])

    def test_predict_rejects_negative_values(self):
        payload = valid_payload()
        payload["values"][3] = -1

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("values[3] tidak boleh negatif", body["errors"])

    def test_predict_rejects_less_than_eighteen_valid_observations(self):
        payload = valid_payload()
        payload["periods"] = payload["periods"][:17]
        payload["values"] = payload["values"][:17]

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("observasi valid minimal 18, saat ini 17", body["errors"])

    def test_predict_rejects_non_consecutive_periods(self):
        payload = valid_payload()
        payload["periods"][5] = "2025-12"

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("periods harus berurutan bulanan tanpa loncatan", body["errors"])

    def test_predict_rejects_null_values_instead_of_compressing_missing_months(self):
        payload = valid_payload()
        payload["values"][0] = None

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn(
            "values[0] tidak boleh null; gunakan segmen histori bulanan kontinu",
            body["errors"],
        )

    def test_predict_rejects_horizon_above_temporary_limit(self):
        payload = valid_payload()
        payload["horizon"] = 4

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("horizon maksimum sementara adalah 3 bulan", body["errors"])

    def test_predict_defaults_horizon_to_one_month(self):
        payload = valid_payload()
        del payload["horizon"]

        response = self.post_predict(payload)

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["forecast_periods"], ["2026-01"])

    def test_health_does_not_require_api_key(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["security"], "configured")


if __name__ == "__main__":
    unittest.main()
