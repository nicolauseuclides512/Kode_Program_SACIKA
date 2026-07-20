import hmac
import os
import re


PLACEHOLDER_PATTERNS = (
    re.compile(r"^replace[_-]?with", re.IGNORECASE),
    re.compile(r"^your[_-]?", re.IGNORECASE),
    re.compile(r"^change[_-]?me", re.IGNORECASE),
    re.compile(r"^secret$", re.IGNORECASE),
)
MIN_WORKER_API_KEY_LENGTH = 32


class WorkerSecurityConfigurationError(RuntimeError):
    pass


def is_placeholder_secret(value):
    text = str(value or "").strip()
    return any(pattern.search(text) for pattern in PLACEHOLDER_PATTERNS)


def get_worker_api_key():
    api_key = os.environ.get("FORECAST_WORKER_API_KEY", "").strip()

    if not api_key:
        raise WorkerSecurityConfigurationError(
            "FORECAST_WORKER_API_KEY belum dikonfigurasi"
        )
    if len(api_key) < MIN_WORKER_API_KEY_LENGTH:
        raise WorkerSecurityConfigurationError(
            f"FORECAST_WORKER_API_KEY minimal {MIN_WORKER_API_KEY_LENGTH} karakter"
        )
    if is_placeholder_secret(api_key):
        raise WorkerSecurityConfigurationError(
            "FORECAST_WORKER_API_KEY masih berupa placeholder"
        )

    return api_key


def validate_worker_runtime_environment():
    get_worker_api_key()


def is_authorized_worker_request(received_key):
    expected_key = get_worker_api_key()
    supplied_key = str(received_key or "")
    return hmac.compare_digest(expected_key, supplied_key)
