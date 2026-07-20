import os
import unittest

from security import (
    WorkerSecurityConfigurationError,
    get_worker_api_key,
    is_authorized_worker_request,
)


class WorkerSecurityTest(unittest.TestCase):
    def setUp(self):
        self.previous = os.environ.get("FORECAST_WORKER_API_KEY")

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("FORECAST_WORKER_API_KEY", None)
        else:
            os.environ["FORECAST_WORKER_API_KEY"] = self.previous

    def test_worker_key_is_required_and_must_be_long(self):
        os.environ.pop("FORECAST_WORKER_API_KEY", None)
        with self.assertRaises(WorkerSecurityConfigurationError):
            get_worker_api_key()

        os.environ["FORECAST_WORKER_API_KEY"] = "short"
        with self.assertRaises(WorkerSecurityConfigurationError):
            get_worker_api_key()

    def test_worker_key_uses_constant_time_comparison_interface(self):
        key = "worker-key-1234567890abcdef1234567890"
        os.environ["FORECAST_WORKER_API_KEY"] = key
        self.assertTrue(is_authorized_worker_request(key))
        self.assertFalse(is_authorized_worker_request("different-key"))


if __name__ == "__main__":
    unittest.main()
