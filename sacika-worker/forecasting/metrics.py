import math


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def count_valid_observations(values):
    return sum(1 for value in values if is_number(value))


def count_missing_observations(values):
    return sum(1 for value in values if value is None)


def count_zero_observations(values):
    return sum(1 for value in values if is_number(value) and value == 0)


def zero_ratio(values):
    observation_count = count_valid_observations(values)
    if observation_count == 0:
        return 0.0

    return count_zero_observations(values) / observation_count


def mae(actuals, predictions):
    if len(actuals) == 0:
        return None

    return sum(abs(actual - predicted) for actual, predicted in zip(actuals, predictions)) / len(actuals)


def rmse(actuals, predictions):
    if len(actuals) == 0:
        return None

    squared_error = sum((actual - predicted) ** 2 for actual, predicted in zip(actuals, predictions))
    return math.sqrt(squared_error / len(actuals))


def wape(actuals, predictions):
    denominator = sum(abs(actual) for actual in actuals)
    if denominator == 0:
        return None

    numerator = sum(abs(actual - predicted) for actual, predicted in zip(actuals, predictions))
    return (numerator / denominator) * 100


def round_metric(value, digits=4):
    if value is None:
        return None

    return round(value, digits)


def _model_name(model_func, model_result=None):
    if isinstance(model_result, dict) and model_result.get("model"):
        return model_result["model"]

    return getattr(model_func, "__name__", "forecast_model")


def _failure_response(model_name, error, folds=None, minimum_training=18):
    return {
        "status": "failed",
        "model": model_name,
        "minimum_training": minimum_training,
        "fold_count": len(folds or []),
        "failed_fold_count": len([fold for fold in (folds or []) if fold["status"] == "failed"]),
        "metrics": {
            "mae": None,
            "rmse": None,
            "wape": None,
        },
        "folds": folds or [],
        "evaluation_policy": {
            "training_values": "raw_observed",
            "test_values": "raw_observed",
            "test_value_transformation": "none",
        },
        "error": str(error),
    }


def rolling_origin_validation(values, model_func, minimum_training=18):
    """Rolling-origin tanpa clipping atau transformasi nilai aktual test.

    Setiap model menerima salinan immutable dari data training. Nilai aktual pada
    setiap fold diambil langsung dari seri sumber dan tidak pernah di-cap,
    di-winsorize, atau diubah berdasarkan statistik training.
    """
    model_name = _model_name(model_func)

    if values is None:
        return _failure_response(model_name, "values tidak boleh kosong", minimum_training=minimum_training)

    series = tuple(values)
    if len(series) <= minimum_training:
        return _failure_response(
            model_name,
            f"jumlah data harus lebih dari minimum training {minimum_training}",
            minimum_training=minimum_training,
        )

    folds = []
    successful_actuals = []
    successful_predictions = []

    for test_index in range(minimum_training, len(series)):
        training = tuple(series[:test_index])
        actual = series[test_index]
        fold = {
            "fold": len(folds) + 1,
            "train_start_index": 0,
            "train_end_index": test_index - 1,
            "test_index": test_index,
            "actual": actual,
            "predicted": None,
            "status": "success",
            "error": None,
        }

        if not is_number(actual):
            fold["status"] = "failed"
            fold["error"] = "actual harus numerik untuk evaluasi"
            folds.append(fold)
            continue

        try:
            result = model_func(training, 1)
            model_name = _model_name(model_func, result)

            if not isinstance(result, dict) or result.get("status") != "success":
                raise ValueError(result.get("error", "model gagal") if isinstance(result, dict) else "model gagal")

            predictions = result.get("predictions", [])
            if len(predictions) < 1 or not is_number(predictions[0]):
                raise ValueError("model tidak mengembalikan prediksi numerik")

            predicted = float(predictions[0])
            fold["predicted"] = predicted
            successful_actuals.append(float(actual))
            successful_predictions.append(predicted)
        except Exception as error:
            fold["status"] = "failed"
            fold["error"] = str(error)

        folds.append(fold)

    failed_fold_count = len([fold for fold in folds if fold["status"] == "failed"])
    if failed_fold_count > 0:
        return _failure_response(
            model_name,
            f"{failed_fold_count} fold gagal",
            folds=folds,
            minimum_training=minimum_training,
        )

    return {
        "status": "success",
        "model": model_name,
        "minimum_training": minimum_training,
        "fold_count": len(folds),
        "failed_fold_count": 0,
        "metrics": {
            "mae": round_metric(mae(successful_actuals, successful_predictions)),
            "rmse": round_metric(rmse(successful_actuals, successful_predictions)),
            "wape": round_metric(wape(successful_actuals, successful_predictions)),
        },
        "folds": folds,
        "evaluation_policy": {
            "training_values": "raw_observed",
            "test_values": "raw_observed",
            "test_value_transformation": "none",
        },
        "error": None,
    }
