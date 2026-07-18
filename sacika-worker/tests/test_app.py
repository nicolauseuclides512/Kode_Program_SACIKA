import unittest

from app import app


def valid_payload():
    periods = []
    values = []

    year = 2024
    month = 1
    for index in range(18):
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
        self.assertEqual(body["status"], "validated")
        self.assertEqual(body["product_id"], 1)
        self.assertEqual(body["target"], "ending_inventory")
        self.assertEqual(body["frequency"], "monthly")
        self.assertEqual(body["observation_count"], 18)
        self.assertEqual(body["model_used"], "validation_only")
        self.assertIsNone(body["forecast"])

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
        payload["values"].append(82)
        payload["periods"].append("2025-07")

        response = self.client.post("/predict", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["observation_count"], 18)
        self.assertEqual(body["missing_observation_count"], 1)


if __name__ == "__main__":
    unittest.main()
