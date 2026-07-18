from .models import build_validation_response
from .validation import validate_prediction_payload


def handle_prediction_request(payload):
    validated_payload = validate_prediction_payload(payload)
    return build_validation_response(validated_payload)
