from flask import Flask, request, jsonify
import subprocess
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def run_arima(produk_id, minggu):
    try:
        # Tentukan perintah python berdasarkan OS (Windows: python, Linux/Mac: python3)
        python_cmd = 'python' if os.name == 'nt' else 'python3'
        
        # Jalankan script arima.py secara eksternal (menggunakan subprocess)
        # Tujuannya untuk mencegah memory leak (RAM menumpuk) dari library statsmodels
        result = subprocess.run(
            [python_cmd, 'arima/arima.py', str(produk_id), str(minggu)],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        output = result.stdout
        error = result.stderr
        
        # Jika script arima.py mengeluarkan tag "RESULT_JSON" di outputnya
        if "RESULT_JSON" in output:
            json_start = output.index("RESULT_JSON") + len("RESULT_JSON")
            json_str = output[json_start:].strip()
            # Parse output string menjadi json dan kembalikan ke backend Express
            return jsonify(json.loads(json_str))
        else:
            return jsonify({
                "error": "Invalid output format",
                "raw": output,
                "stderr": error,
                "returncode": result.returncode
            }), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint POST yang dipanggil oleh server backend Express
@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    produk_id = data.get('produk_id')
    minggu = data.get('minggu', 1)
    
    # Jalankan perhitungan ARIMA
    return run_arima(produk_id, minggu)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
