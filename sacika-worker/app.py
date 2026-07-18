import os

from flask import Flask, jsonify, request
from dotenv import load_dotenv

from forecasting.selector import ForecastSelectionError, handle_prediction_request
from forecasting.validation import PayloadValidationError

load_dotenv()

app = Flask(__name__)


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
    except Exception as error:
        return jsonify({
            "status": "error",
            "message": str(error),
        }), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
