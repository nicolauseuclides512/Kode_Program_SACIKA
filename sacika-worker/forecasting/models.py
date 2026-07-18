from .metrics import zero_ratio


def build_validation_response(validated_payload):
    return {
        "status": "validated",
        "message": "Payload valid. Model forecasting belum dijalankan pada tahap ini.",
        "product_id": validated_payload["product_id"],
        "target": validated_payload["target"],
        "frequency": validated_payload["frequency"],
        "horizon": validated_payload["horizon"],
        "period_start": validated_payload["period_start"],
        "period_end": validated_payload["period_end"],
        "observation_count": validated_payload["observation_count"],
        "missing_observation_count": validated_payload["missing_observation_count"],
        "zero_ratio": round(zero_ratio(validated_payload["values"]), 4),
        "model_used": "validation_only",
        "forecast": None,
    }
