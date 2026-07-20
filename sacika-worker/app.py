import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from forecasting.selector import ForecastSelectionError, handle_prediction_request
from forecasting.validation import PayloadValidationError
from security import (
    WorkerSecurityConfigurationError,
    is_authorized_worker_request,
    validate_worker_runtime_environment,
)

load_dotenv()

app = Flask(__name__)


def _worker_auth_error_response():
    try:
        authorized = is_authorized_worker_request(
            request.headers.get("X-Worker-API-Key")
        )
    except WorkerSecurityConfigurationError:
        return jsonify({
            "status": "unavailable",
            "message": "Worker forecasting belum dikonfigurasi dengan aman",
        }), 503

    if not authorized:
        return jsonify({
            "status": "unauthorized",
            "message": "Akses worker forecasting ditolak",
        }), 401

    return None


@app.before_request
def protect_predict_endpoint():
    if request.path == "/predict":
        return _worker_auth_error_response()
    return None


@app.route('/predict', methods=['POST'])
def predict():
    try:
        payload = request.get_json(silent=True)
        result = handle_prediction_request(payload)
        return jsonify(result)
    except PayloadValidationError as error:
        return jsonify({
            "status": "invalid",
            "errors": error.errors,
        }), 400
    except ForecastSelectionError as error:
        return jsonify({
            "status": "failed",
            "error": str(error),
        }), 422
    except Exception:
        app.logger.exception("Kesalahan internal pada worker forecasting")
        return jsonify({
            "status": "error",
            "message": "Terjadi kesalahan internal pada worker forecasting",
        }), 500


@app.route('/health', methods=['GET'])
def health():
    try:
        validate_worker_runtime_environment()
        security_status = "configured"
    except WorkerSecurityConfigurationError:
        security_status = "misconfigured"

    return jsonify({
        "status": "healthy",
        "security": security_status,
    })


if __name__ == '__main__':
    validate_worker_runtime_environment()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
