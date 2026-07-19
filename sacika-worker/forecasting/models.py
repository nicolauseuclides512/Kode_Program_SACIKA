import math
import warnings

import numpy as np
from statsmodels.tools.sm_exceptions import ConvergenceWarning
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import Holt, SimpleExpSmoothing


ALLOWED_ARIMA_ORDERS = (
    (1, 0, 0),
    (0, 1, 1),
    (1, 1, 0),
    (1, 1, 1),
)


def _success(model_name, predictions, metadata=None):
    return {
        "status": "success",
        "model": model_name,
        "predictions": _clean_predictions(predictions),
        "error": None,
        "metadata": metadata or {},
    }


def _failed(model_name, error, metadata=None):
    return {
        "status": "failed",
        "model": model_name,
        "predictions": [],
        "error": str(error),
        "metadata": metadata or {},
    }


def _prepare_training(training, model_name, min_length=1):
    if training is None:
        raise ValueError(f"{model_name} membutuhkan data training")

    values = list(training)
    if len(values) < min_length:
        raise ValueError(f"{model_name} membutuhkan minimal {min_length} observasi")

    prepared = []
    for index, value in enumerate(values):
        if value is None:
            raise ValueError(f"training[{index}] tidak boleh null untuk model")
        if isinstance(value, bool):
            raise ValueError(f"training[{index}] harus numerik")

        numeric_value = float(value)
        if not math.isfinite(numeric_value):
            raise ValueError(f"training[{index}] harus finite")
        if numeric_value < 0:
            raise ValueError(f"training[{index}] tidak boleh negatif")

        prepared.append(numeric_value)

    return np.array(prepared, dtype=float)


def _validate_horizon(horizon):
    if not isinstance(horizon, int) or isinstance(horizon, bool) or horizon <= 0:
        raise ValueError("horizon harus integer positif")

    return horizon


def _clean_predictions(predictions):
    cleaned = []

    for value in list(predictions):
        numeric_value = float(value)
        if not math.isfinite(numeric_value):
            numeric_value = 0.0
        cleaned.append(max(0.0, numeric_value))

    return cleaned


def _fit_with_convergence_as_error(fit_callable):
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        return fit_callable()


def naive_forecast(training, horizon):
    model_name = "naive"

    try:
        values = _prepare_training(training, model_name, min_length=1)
        steps = _validate_horizon(horizon)
        return _success(model_name, [values[-1]] * steps)
    except Exception as error:
        return _failed(model_name, error)


def single_exponential_smoothing_forecast(training, horizon):
    model_name = "single_exponential_smoothing"

    try:
        values = _prepare_training(training, model_name, min_length=2)
        steps = _validate_horizon(horizon)

        def fit_model():
            model = SimpleExpSmoothing(
                values,
                initialization_method="estimated",
            )
            return model.fit(optimized=True)

        fit = _fit_with_convergence_as_error(fit_model)
        return _success(
            model_name,
            fit.forecast(steps),
            metadata={
                "smoothing_level": _safe_float(
                    fit.params.get("smoothing_level"),
                ),
            },
        )
    except Exception as error:
        return _failed(model_name, error)


def damped_holt_forecast(training, horizon):
    model_name = "damped_holt"

    try:
        values = _prepare_training(training, model_name, min_length=3)
        steps = _validate_horizon(horizon)

        def fit_model():
            model = Holt(
                values,
                damped_trend=True,
                initialization_method="estimated",
            )
            return model.fit(optimized=True)

        fit = _fit_with_convergence_as_error(fit_model)
        return _success(
            model_name,
            fit.forecast(steps),
            metadata={
                "smoothing_level": _safe_float(
                    fit.params.get("smoothing_level"),
                ),
                "smoothing_trend": _safe_float(
                    fit.params.get("smoothing_trend"),
                ),
                "damping_trend": _safe_float(
                    fit.params.get("damping_trend"),
                ),
            },
        )
    except Exception as error:
        return _failed(model_name, error)


def arima_forecast(training, horizon, order=(1, 1, 1)):
    model_name = "arima"

    try:
        if tuple(order) not in ALLOWED_ARIMA_ORDERS:
            raise ValueError(f"order {tuple(order)} tidak diizinkan")

        values = _prepare_training(training, model_name, min_length=4)
        steps = _validate_horizon(horizon)

        def fit_model():
            model = ARIMA(
                values,
                order=tuple(order),
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            return model.fit()

        fit = _fit_with_convergence_as_error(fit_model)
        return _success(
            model_name,
            fit.forecast(steps=steps),
            metadata={
                "order": list(order),
                "aic": _safe_float(fit.aic),
            },
        )
    except Exception as error:
        return _failed(
            model_name,
            error,
            metadata={"order": list(order) if isinstance(order, tuple) else order},
        )


def arima_candidate_forecasts(training, horizon):
    return [
        arima_forecast(training, horizon, order=order)
        for order in ALLOWED_ARIMA_ORDERS
    ]


def _safe_float(value):
    if value is None:
        return None

    numeric_value = float(value)
    if not math.isfinite(numeric_value):
        return None

    return numeric_value
