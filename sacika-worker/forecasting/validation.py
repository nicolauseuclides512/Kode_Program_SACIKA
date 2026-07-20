import os
import re

from .metrics import count_missing_observations, count_valid_observations, is_number


PERIOD_RE = re.compile(r"^(\d{4})-(\d{2})$")
ALLOWED_TARGETS = {"ending_inventory", "monthly_sales"}
ALLOWED_FREQUENCIES = {"monthly"}
DEFAULT_MIN_OBSERVATIONS = int(os.environ.get("FORECAST_MIN_OBSERVATIONS", "18"))
DEFAULT_MIN_SALES_OBSERVATIONS = int(os.environ.get("FORECAST_MIN_SALES_OBSERVATIONS", "12"))
MAX_FORECAST_HORIZON = int(os.environ.get("FORECAST_MAX_HORIZON", "3"))


class PayloadValidationError(Exception):
    def __init__(self, errors):
        super().__init__("Payload tidak valid")
        self.errors = errors


def period_to_index(period):
    match = PERIOD_RE.match(period)
    if not match:
        return None

    year = int(match.group(1))
    month = int(match.group(2))
    if month < 1 or month > 12:
        return None

    return (year * 12) + month


def validate_periods_are_consecutive(periods):
    indexes = []

    for index, period in enumerate(periods):
        if not isinstance(period, str):
            return f"periods[{index}] harus string berformat YYYY-MM"

        period_index = period_to_index(period)
        if period_index is None:
            return f"periods[{index}] harus berformat YYYY-MM dengan bulan valid"

        indexes.append(period_index)

    for index in range(1, len(indexes)):
        if indexes[index] != indexes[index - 1] + 1:
            return "periods harus berurutan bulanan tanpa loncatan"

    return None


def validate_values(values):
    normalized = []
    errors = []

    for index, value in enumerate(values):
        if value is None:
            errors.append(
                f"values[{index}] tidak boleh null; gunakan segmen histori bulanan kontinu"
            )
            normalized.append(None)
            continue

        if not is_number(value):
            errors.append(f"values[{index}] harus numerik atau null untuk missing")
            continue

        if value < 0:
            errors.append(f"values[{index}] tidak boleh negatif")
            continue

        normalized.append(float(value))

    return normalized, errors


def validate_prediction_payload(payload, min_observations=None):
    errors = []

    if not isinstance(payload, dict):
        raise PayloadValidationError(["Request body harus JSON object"])

    product_id = payload.get("product_id")
    if not isinstance(product_id, int) or isinstance(product_id, bool) or product_id <= 0:
        errors.append("product_id wajib berupa integer positif")

    target = payload.get("target")
    if target not in ALLOWED_TARGETS:
        errors.append("target harus bernilai ending_inventory atau monthly_sales")

    required_observations = min_observations
    if required_observations is None:
        required_observations = (
            DEFAULT_MIN_SALES_OBSERVATIONS
            if target == "monthly_sales"
            else DEFAULT_MIN_OBSERVATIONS
        )

    frequency = payload.get("frequency")
    if frequency not in ALLOWED_FREQUENCIES:
        errors.append("frequency harus bernilai monthly")

    periods = payload.get("periods")
    values = payload.get("values")
    if not isinstance(periods, list) or len(periods) == 0:
        errors.append("periods wajib berupa array dan tidak boleh kosong")

    if not isinstance(values, list) or len(values) == 0:
        errors.append("values wajib berupa array dan tidak boleh kosong")

    if isinstance(periods, list) and isinstance(values, list):
        if len(periods) != len(values):
            errors.append("panjang periods dan values harus sama")
        else:
            period_error = validate_periods_are_consecutive(periods)
            if period_error:
                errors.append(period_error)

            normalized_values, value_errors = validate_values(values)
            errors.extend(value_errors)

            observation_count = count_valid_observations(normalized_values)
            if observation_count < required_observations:
                errors.append(
                    f"observasi valid minimal {required_observations}, saat ini {observation_count}"
                )
    else:
        normalized_values = []
        observation_count = 0

    horizon = payload.get("horizon", 1)
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon <= 0:
        errors.append("horizon wajib berupa integer positif")
    elif horizon > MAX_FORECAST_HORIZON:
        errors.append(f"horizon maksimum sementara adalah {MAX_FORECAST_HORIZON} bulan")

    if errors:
        raise PayloadValidationError(errors)

    return {
        "product_id": product_id,
        "target": target,
        "frequency": frequency,
        "periods": periods,
        "values": normalized_values,
        "horizon": horizon,
        "observation_count": observation_count,
        "missing_observation_count": count_missing_observations(normalized_values),
        "period_start": periods[0],
        "period_end": periods[-1],
    }
