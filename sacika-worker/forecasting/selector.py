import os
from functools import partial

from .metrics import rolling_origin_validation, zero_ratio
from .models import (
    ALLOWED_ARIMA_ORDERS,
    arima_forecast,
    damped_holt_forecast,
    naive_forecast,
    single_exponential_smoothing_forecast,
)
from .validation import validate_prediction_payload


DEFAULT_MAE_TIE_RELATIVE_TOLERANCE_PCT = 1.0
DEFAULT_MIN_IMPROVEMENT_OVER_NAIVE_PCT = 5.0
HIGH_ZERO_RATIO_THRESHOLD = 0.5
MODEL_COMPLEXITY_RANK = {
    "Naive": 0,
    "SES": 1,
    "Damped Holt": 2,
    "ARIMA": 3,
}


class ForecastSelectionError(Exception):
    pass


def _read_percentage_env(name, default):
    raw_value = os.environ.get(name)
    if raw_value is None or str(raw_value).strip() == "":
        return float(default)

    try:
        value = float(raw_value)
    except ValueError as error:
        raise ForecastSelectionError(f"{name} harus numerik") from error

    if value < 0 or value > 100:
        raise ForecastSelectionError(f"{name} harus berada antara 0 dan 100")

    return value


def get_mae_tie_relative_tolerance_pct():
    return _read_percentage_env(
        "FORECAST_MAE_TIE_RELATIVE_TOLERANCE_PCT",
        DEFAULT_MAE_TIE_RELATIVE_TOLERANCE_PCT,
    )


def get_min_improvement_over_naive_pct():
    return _read_percentage_env(
        "FORECAST_MIN_IMPROVEMENT_OVER_NAIVE_PCT",
        DEFAULT_MIN_IMPROVEMENT_OVER_NAIVE_PCT,
    )


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


def _continuous_history(periods, values):
    if len(periods) != len(values):
        raise ForecastSelectionError("Panjang periods dan values tidak sama")

    if any(value is None for value in values):
        raise ForecastSelectionError(
            "Histori worker harus berupa segmen bulanan kontinu tanpa nilai null"
        )

    return list(periods), [float(value) for value in values]


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
        "selected": False,
        "improvement_over_naive_pct": None,
    }


def _successful_candidate(candidate):
    return (
        candidate["evaluation"]["status"] == "success"
        and candidate["evaluation"]["metrics"]["mae"] is not None
    )


def _relative_tolerance(first_value, second_value, percentage):
    scale = max(abs(float(first_value)), abs(float(second_value)), 1.0)
    return scale * (float(percentage) / 100.0)


def _candidate_rank(candidate):
    return MODEL_COMPLEXITY_RANK.get(candidate.get("display_name"), 999)


def _is_better_candidate(candidate, current_best, relative_tolerance_pct=None):
    if current_best is None:
        return True

    tolerance_pct = (
        get_mae_tie_relative_tolerance_pct()
        if relative_tolerance_pct is None
        else float(relative_tolerance_pct)
    )

    candidate_metrics = candidate["evaluation"]["metrics"]
    best_metrics = current_best["evaluation"]["metrics"]
    candidate_mae = float(candidate_metrics["mae"])
    best_mae = float(best_metrics["mae"])
    mae_tolerance = _relative_tolerance(candidate_mae, best_mae, tolerance_pct)

    if abs(candidate_mae - best_mae) <= mae_tolerance:
        candidate_rmse = float(candidate_metrics["rmse"])
        best_rmse = float(best_metrics["rmse"])
        rmse_tolerance = _relative_tolerance(candidate_rmse, best_rmse, tolerance_pct)

        if candidate_rmse < best_rmse - rmse_tolerance:
            return True
        if abs(candidate_rmse - best_rmse) <= rmse_tolerance:
            return _candidate_rank(candidate) < _candidate_rank(current_best)
        return False

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
                metadata={
                    "order": list(order),
                    "candidate_policy": "simple_non_seasonal",
                },
            ),
            "metadata": {
                "order": list(order),
                "candidate_policy": "simple_non_seasonal",
            },
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
                "error": "Semua kandidat ARIMA sederhana gagal dievaluasi",
            },
            "summary": {
                "model": "ARIMA",
                "status": "failed",
                "mae": None,
                "rmse": None,
                "wape": None,
                "test_points": 0,
                "error": "Semua kandidat ARIMA sederhana gagal dievaluasi",
                "metadata": {
                    "orders": order_summaries,
                    "candidate_policy": "simple_non_seasonal",
                },
                "selected": False,
                "improvement_over_naive_pct": None,
            },
            "metadata": {
                "orders": order_summaries,
                "candidate_policy": "simple_non_seasonal",
            },
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


def _improvement_percentage(reference_mae, candidate_mae):
    reference = float(reference_mae)
    candidate = float(candidate_mae)

    if reference <= 0:
        return 0.0

    return ((reference - candidate) / reference) * 100.0


def _apply_naive_guard(candidates, best_overall):
    naive_candidate = next(
        (
            candidate
            for candidate in candidates
            if candidate["display_name"] == "Naive" and _successful_candidate(candidate)
        ),
        None,
    )
    minimum_improvement_pct = get_min_improvement_over_naive_pct()
    tie_tolerance_pct = get_mae_tie_relative_tolerance_pct()

    if naive_candidate is None:
        return best_overall, {
            "policy": "best_available_without_naive_baseline",
            "selected_model": best_overall["display_name"],
            "naive_mae": None,
            "selected_mae": best_overall["evaluation"]["metrics"]["mae"],
            "improvement_over_naive_pct": None,
            "minimum_improvement_required_pct": minimum_improvement_pct,
            "mae_tie_relative_tolerance_pct": tie_tolerance_pct,
            "reason": "Naive gagal dievaluasi sehingga model terbaik yang tersedia digunakan",
        }

    naive_mae = naive_candidate["evaluation"]["metrics"]["mae"]
    best_mae = best_overall["evaluation"]["metrics"]["mae"]
    improvement_pct = _improvement_percentage(naive_mae, best_mae)

    if best_overall["display_name"] == "Naive":
        selected = naive_candidate
        reason = "Naive mempunyai performa terbaik atau setara dalam toleransi"
        policy = "naive_best_or_tied"
    elif improvement_pct + 1e-12 < minimum_improvement_pct:
        selected = naive_candidate
        reason = (
            f"Peningkatan MAE model terbaik hanya {improvement_pct:.2f}% dan belum "
            f"mencapai batas {minimum_improvement_pct:.2f}% dibanding Naive"
        )
        policy = "naive_minimum_improvement_guard"
    else:
        selected = best_overall
        reason = (
            f"Model terpilih meningkatkan MAE {improvement_pct:.2f}% dibanding Naive, "
            f"melewati batas {minimum_improvement_pct:.2f}%"
        )
        policy = "challenger_exceeds_naive_threshold"

    return selected, {
        "policy": policy,
        "selected_model": selected["display_name"],
        "naive_mae": naive_mae,
        "selected_mae": selected["evaluation"]["metrics"]["mae"],
        "best_challenger_model": best_overall["display_name"],
        "best_challenger_mae": best_mae,
        "improvement_over_naive_pct": round(improvement_pct, 4),
        "minimum_improvement_required_pct": minimum_improvement_pct,
        "mae_tie_relative_tolerance_pct": tie_tolerance_pct,
        "reason": reason,
    }


def evaluate_candidate_models(values):
    candidates = [
        _evaluate_model("Naive", naive_forecast, values),
        _evaluate_model("SES", single_exponential_smoothing_forecast, values),
        _evaluate_model("Damped Holt", damped_holt_forecast, values),
        _evaluate_arima(values),
    ]

    best_overall = None
    for candidate in candidates:
        if _successful_candidate(candidate) and _is_better_candidate(candidate, best_overall):
            best_overall = candidate

    if best_overall is None:
        raise ForecastSelectionError("Tidak ada model yang berhasil dievaluasi")

    selected, selection = _apply_naive_guard(candidates, best_overall)
    naive_candidate = next(
        (candidate for candidate in candidates if candidate["display_name"] == "Naive"),
        None,
    )
    naive_mae = (
        naive_candidate["evaluation"]["metrics"]["mae"]
        if naive_candidate and _successful_candidate(naive_candidate)
        else None
    )

    for candidate in candidates:
        summary = candidate["summary"]
        summary["selected"] = candidate is selected
        if naive_mae is not None and _successful_candidate(candidate):
            summary["improvement_over_naive_pct"] = round(
                _improvement_percentage(
                    naive_mae,
                    candidate["evaluation"]["metrics"]["mae"],
                ),
                4,
            )

    return selected, [candidate["summary"] for candidate in candidates], selection


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
    valid_periods, valid_values = _continuous_history(
        validated_payload["periods"],
        validated_payload["values"],
    )

    best_candidate, candidate_summaries, selection = evaluate_candidate_models(valid_values)
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
            "policy": best_candidate["evaluation"].get("evaluation_policy"),
        },
        "selection": selection,
        "candidate_models": candidate_summaries,
        "backtest": _backtest_rows(best_candidate, valid_periods),
        "warning": _warning_messages(validated_payload, valid_values, forecast_values),
    }
