from functools import partial

from .metrics import is_number, rolling_origin_validation, zero_ratio
from .models import (
    ALLOWED_ARIMA_ORDERS,
    arima_forecast,
    damped_holt_forecast,
    naive_forecast,
    single_exponential_smoothing_forecast,
)
from .validation import validate_prediction_payload


MAE_TIE_TOLERANCE = 1e-6
HIGH_ZERO_RATIO_THRESHOLD = 0.5


class ForecastSelectionError(Exception):
    pass


def _period_to_year_month(period):
    year, month = period.split("-")
    return int(year), int(month)


def _next_period(period):
    year, month = _period_to_year_month(period)
    month += 1
    if month > 12:
        month = 1
        year += 1

    return f"{year}-{month:02d}"


def generate_future_periods(last_period, horizon):
    periods = []
    current = last_period

    for _ in range(horizon):
        current = _next_period(current)
        periods.append(current)

    return periods


def _valid_history(periods, values):
    valid_periods = []
    valid_values = []

    for period, value in zip(periods, values):
        if is_number(value):
            valid_periods.append(period)
            valid_values.append(float(value))

    return valid_periods, valid_values


def _candidate_summary(display_name, evaluation, metadata=None):
    metrics = evaluation.get("metrics", {})

    return {
        "model": display_name,
        "status": evaluation["status"],
        "mae": metrics.get("mae"),
        "rmse": metrics.get("rmse"),
        "wape": metrics.get("wape"),
        "test_points": evaluation.get("fold_count", 0),
        "error": evaluation.get("error"),
        "metadata": metadata or {},
    }


def _successful_candidate(candidate):
    return (
        candidate["evaluation"]["status"] == "success"
        and candidate["evaluation"]["metrics"]["mae"] is not None
    )


def _is_better_candidate(candidate, current_best):
    if current_best is None:
        return True

    candidate_metrics = candidate["evaluation"]["metrics"]
    best_metrics = current_best["evaluation"]["metrics"]
    candidate_mae = candidate_metrics["mae"]
    best_mae = best_metrics["mae"]

    if abs(candidate_mae - best_mae) <= MAE_TIE_TOLERANCE:
        return candidate_metrics["rmse"] < best_metrics["rmse"]

    return candidate_mae < best_mae


def _evaluate_model(display_name, model_func, values, metadata=None):
    evaluation = rolling_origin_validation(values, model_func)
    return {
        "display_name": display_name,
        "forecast_func": model_func,
        "evaluation": evaluation,
        "summary": _candidate_summary(display_name, evaluation, metadata),
        "metadata": metadata or {},
    }


def _evaluate_arima(values):
    best_arima = None
    order_summaries = []

    for order in ALLOWED_ARIMA_ORDERS:
        model_func = partial(arima_forecast, order=order)
        evaluation = rolling_origin_validation(values, model_func)
        candidate = {
            "display_name": "ARIMA",
            "forecast_func": model_func,
            "evaluation": evaluation,
            "summary": _candidate_summary(
                "ARIMA",
                evaluation,
                metadata={"order": list(order)},
            ),
            "metadata": {"order": list(order)},
        }
        order_summaries.append(candidate["summary"])

        if _successful_candidate(candidate) and _is_better_candidate(candidate, best_arima):
            best_arima = candidate

    if best_arima is None:
        return {
            "display_name": "ARIMA",
            "forecast_func": partial(arima_forecast, order=ALLOWED_ARIMA_ORDERS[0]),
            "evaluation": {
                "status": "failed",
                "model": "ARIMA",
                "fold_count": 0,
                "failed_fold_count": 0,
                "metrics": {"mae": None, "rmse": None, "wape": None},
                "folds": [],
                "error": "Semua kandidat ARIMA gagal dievaluasi",
            },
            "summary": {
                "model": "ARIMA",
                "status": "failed",
                "mae": None,
                "rmse": None,
                "wape": None,
                "test_points": 0,
                "error": "Semua kandidat ARIMA gagal dievaluasi",
                "metadata": {"orders": order_summaries},
            },
            "metadata": {"orders": order_summaries},
        }

    best_arima["summary"]["metadata"]["orders"] = [
        {
            "model": summary["model"],
            "status": summary["status"],
            "mae": summary["mae"],
            "rmse": summary["rmse"],
            "wape": summary["wape"],
            "test_points": summary["test_points"],
            "error": summary["error"],
            "metadata": dict(summary.get("metadata", {})),
        }
        for summary in order_summaries
    ]
    return best_arima


def evaluate_candidate_models(values):
    candidates = [
        _evaluate_model("Naive", naive_forecast, values),
        _evaluate_model("SES", single_exponential_smoothing_forecast, values),
        _evaluate_model("Damped Holt", damped_holt_forecast, values),
        _evaluate_arima(values),
    ]

    best = None
    for candidate in candidates:
        if _successful_candidate(candidate) and _is_better_candidate(candidate, best):
            best = candidate

    if best is None:
        raise ForecastSelectionError("Tidak ada model yang berhasil dievaluasi")

    return best, [candidate["summary"] for candidate in candidates]


def _backtest_rows(best_candidate, valid_periods):
    rows = []

    for fold in best_candidate["evaluation"]["folds"]:
        period = valid_periods[fold["test_index"]]
        rows.append({
            "period": period,
            "actual": fold["actual"],
            "predicted": fold["predicted"],
        })

    return rows


def _warning_messages(validated_payload, valid_values, forecast_values):
    warnings = []
    observation_count = len(valid_values)

    if observation_count < 24:
        warnings.append("Observasi valid kurang dari 24 bulan")

    if validated_payload["missing_observation_count"] > 0:
        warnings.append("Terdapat bulan hilang pada histori")

    if zero_ratio(valid_values) >= HIGH_ZERO_RATIO_THRESHOLD and observation_count > 0:
        warnings.append("Rasio nilai nol tinggi")

    if _forecast_far_outside_history(valid_values, forecast_values):
        warnings.append("Nilai prediksi berada jauh di luar rentang historis")

    return warnings or None


def _forecast_far_outside_history(values, forecast_values):
    if len(values) == 0 or len(forecast_values) == 0:
        return False

    historical_min = min(values)
    historical_max = max(values)
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    stddev = variance ** 0.5

    if stddev == 0:
        return any(value != historical_min for value in forecast_values)

    lower = max(0, historical_min - (3 * stddev))
    upper = historical_max + (3 * stddev)

    return any(value < lower or value > upper for value in forecast_values)


def handle_prediction_request(payload):
    validated_payload = validate_prediction_payload(payload)
    valid_periods, valid_values = _valid_history(
        validated_payload["periods"],
        validated_payload["values"],
    )

    best_candidate, candidate_summaries = evaluate_candidate_models(valid_values)
    forecast_result = best_candidate["forecast_func"](
        valid_values,
        validated_payload["horizon"],
    )

    if forecast_result["status"] != "success":
        raise ForecastSelectionError(
            f"Model terpilih gagal dilatih ulang: {forecast_result['error']}"
        )

    forecast_values = forecast_result["predictions"]
    evaluation_metrics = best_candidate["evaluation"]["metrics"]

    return {
        "product_id": validated_payload["product_id"],
        "target": validated_payload["target"],
        "frequency": validated_payload["frequency"],
        "model_used": best_candidate["display_name"],
        "forecast_periods": generate_future_periods(
            validated_payload["periods"][-1],
            validated_payload["horizon"],
        ),
        "forecast_values": forecast_values,
        "evaluation": {
            "mae": evaluation_metrics["mae"],
            "rmse": evaluation_metrics["rmse"],
            "wape": evaluation_metrics["wape"],
            "test_points": best_candidate["evaluation"]["fold_count"],
        },
        "candidate_models": candidate_summaries,
        "backtest": _backtest_rows(best_candidate, valid_periods),
        "warning": _warning_messages(validated_payload, valid_values, forecast_values),
    }
