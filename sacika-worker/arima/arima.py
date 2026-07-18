import sys
import requests
import numpy as np
import json
import warnings
import os

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
)

warnings.filterwarnings("ignore")


args = sys.argv

produk_id = args[1] if len(args) > 1 else "1"

periode = args[2] if len(args) > 2 else "1"



steps = {
    "1": 1,
    "4": 4,
    "12": 12,
}.get(str(periode), 1)


MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agst", "Sept", "Okt", "Nov", "Des",
]


def next_period(period_label):
    """Generate the next weekly period label after the given one."""
    parts = period_label.split(" ")
    month_str = parts[0]
    year_week = parts[1]
    year_str, week_str = year_week.split("-W")
    year = int(year_str)
    week = int(week_str)

    month_idx = MONTHS.index(month_str)

    if week < 4:
        week += 1
    else:
        week = 1
        month_idx += 1
        if month_idx >= 12:
            month_idx = 0
            year += 1

    full_year = 2000 + year if year < 100 else year
    short_year = full_year % 100

    return f"{MONTHS[month_idx]} {short_year}-W{week}"


def generate_future_labels(last_label, n_steps):
    """Generate n future period labels starting after last_label."""
    labels = []
    current = last_label
    for _ in range(n_steps):
        current = next_period(current)
        labels.append(current)
    return labels


def to_display_label(internal_label):
    """Convert 'Jan 26-W1' to 'W1-Jan'."""
    parts = internal_label.split(" ")
    month_str = parts[0]
    week_str = parts[1].split("-")[1]
    return f"{week_str}-{month_str}"


def trim_leading_zeros(periods_list, values_array):
    """Remove leading zeros from time series."""
    first_nonzero = 0
    for i, v in enumerate(values_array):
        if v != 0:
            first_nonzero = i
            break
    else:
        return periods_list, values_array

    return periods_list[first_nonzero:], values_array[first_nonzero:]


def cap_outliers(values_array):
    """Cap outliers above mean + 3*std."""
    mean = np.mean(values_array)
    std = np.std(values_array)
    cap = mean + 3 * std
    capped = np.clip(values_array, None, cap)
    return capped, cap


# Fungsi Uji Stasioneritas ADF (Augmented Dickey-Fuller)
# Menentukan ordo d (differencing) secara otomatis: d=0 jika stasioner, d=1 jika tidak stasioner
def get_adfuller_d(train_data):
    try:
        # Jika data terlalu sedikit atau datar, langsung default d=1
        if len(train_data) < 8 or np.std(train_data) == 0:
            return 1
        result = adfuller(train_data)
        p_value = result[1]
        # Jika p-value < 0.05, data sudah stasioner (d=0). Jika tidak, butuh differencing (d=1)
        return 0 if p_value < 0.05 else 1
    except Exception:
        return 1


# Grid Search AIC untuk mencari kombinasi parameter ordo ARIMA (p, d, q) terbaik
def find_best_arima_order(train_data):
    d = get_adfuller_d(train_data) # Tentukan d dulu lewat uji ADF
    best_aic = np.inf
    best_order = (1, d, 1) # Default fallback order jika grid search gagal

    # Coba kombinasi p [0-3] dan q [0-3]
    for p in range(4):
        for q in range(4):
            if p == 0 and q == 0:
                continue
            try:
                model = ARIMA(
                    train_data,
                    order=(p, d, q),
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                fit = model.fit()
                # Cari nilai AIC terkecil (semakin kecil, model semakin efisien)
                if fit.aic < best_aic:
                    best_aic = fit.aic
                    best_order = (p, d, q)
            except Exception:
                continue

    return best_order, best_aic


def moving_average_forecast(values_array, n_steps, window=4):
    """Simple moving average forecast."""
    if len(values_array) < window:
        window = len(values_array)
    ma = np.mean(values_array[-window:])
    return [max(1, int(round(ma)))] * n_steps



try:
    backend_url = os.environ.get('BACKEND_URL', 'https://sacika-backend-8e4c40605b82.herokuapp.com')
    url = f"{backend_url}/api/prediksi/dataset/{produk_id}"

    response = requests.get(
        url,
        timeout=10,
    )

    data = response.json()

except Exception as e:

    print("RESULT_JSON")

    print(
        json.dumps(
            {
                "error": "Gagal mengambil data",
                "detail": str(e),
            }
        )
    )

    sys.exit()


if not data or len(data) < 5:

    print("RESULT_JSON")

    print(
        json.dumps(
            {
                "error": "Data tidak cukup",
            }
        )
    )

    sys.exit()


periods = [row["period"] for row in data]
values = [float(row["total"]) for row in data]

ts = np.array(values)

periods, ts = trim_leading_zeros(periods, ts)


if len(ts) > 52:
    ts = ts[-52:]
    periods = periods[-52:]


if len(ts) < 10:

    print("RESULT_JSON")

    print(
        json.dumps(
            {
                "error": "Data terlalu sedikit setelah trim",
            }
        )
    )

    sys.exit()



# FALLBACK CHECK: Deteksi minggu libur / produk intermittent
zero_ratio = np.sum(ts == 0) / len(ts)

# Jika data kosong (0) lebih dari 50% minggu, jangan pakai ARIMA (error).
# Sistem otomatis beralih menggunakan Moving Average.
if zero_ratio > 0.5:
    forecast = moving_average_forecast(ts, steps, window=4)

    labels_internal = generate_future_labels(periods[-1], steps)
    labels_display = [to_display_label(l) for l in labels_internal]
    
    # Hitung akurasi Moving Average untuk data uji
    split = int(len(ts) * 0.8)
    train_ma = ts[:split]
    test_ma = ts[split:]

    if len(test_ma) > 0:
        forecast_test_ma = moving_average_forecast(train_ma, len(test_ma), window=4)
        mae = float(mean_absolute_error(test_ma, forecast_test_ma))
        mse = float(mean_squared_error(test_ma, forecast_test_ma))
        rmse = float(np.sqrt(mse))
        mape = float(np.mean(np.abs(test_ma - forecast_test_ma) / np.maximum(1, test_ma)) * 100)
        akurasi = max(0.0, min(100.0, 100.0 - mape))
        evaluasi = {
            "mae": round(mae, 3),
            "mse": round(mse, 3),
            "rmse": round(rmse, 3),
            "mape": round(mape, 2) if mape is not None else None,
            "akurasi": round(akurasi, 2) if akurasi is not None else None,
        }
    else:
        evaluasi = None

    result = {
        "mode": "weekly",
        "model_used": "MovingAverage",
        "prediksi": forecast,
        "labels_internal": labels_internal,
        "labels_display": labels_display,
        "stok_dibutuhkan": int(sum(forecast)),
        "evaluasi": evaluasi,
    }

    print("RESULT_JSON")
    print(json.dumps(result))
    sys.exit()


if np.std(ts) == 0:

    avg = max(1, int(round(np.mean(ts))))

    forecast = [avg] * steps

    labels_internal = generate_future_labels(periods[-1], steps)
    labels_display = [to_display_label(l) for l in labels_internal]

    result = {
        "mode": "weekly",
        "model_used": "Flat",
        "prediksi": forecast,
        "labels_internal": labels_internal,
        "labels_display": labels_display,
        "stok_dibutuhkan": int(sum(forecast)),
        "evaluasi": None,
        "note": "Data flat",
    }

    print("RESULT_JSON")

    print(json.dumps(result))

    sys.exit()


# PEMBAGIAN DATA KRONOLOGIS (80% Latih / 20% Uji)
split = int(len(ts) * 0.8)
train = ts[:split]
test = ts[split:]

# Batasi pencilan ekstrim pada data latih agar model stabil
train, outlier_cap = cap_outliers(train)
test = np.clip(test, None, outlier_cap)
ts = np.append(train, test)

if len(train) < 5 or len(test) < 1:
    avg = max(1, int(round(np.mean(ts))))
    forecast = [avg] * steps
    labels_internal = generate_future_labels(periods[-1], steps)
    labels_display = [to_display_label(l) for l in labels_internal]

    result = {
        "mode": "weekly",
        "model_used": "Fallback",
        "prediksi": forecast,
        "labels_internal": labels_internal,
        "labels_display": labels_display,
        "stok_dibutuhkan": int(sum(forecast)),
        "evaluasi": None,
        "note": "Data minim",
    }
    print("RESULT_JSON")
    print(json.dumps(result))
    sys.exit()

# Cari ordo ARIMA terbaik untuk data latih
best_order, best_aic = find_best_arima_order(train)

try:
    # 1. EVALUASI AKURASI: Latih model di data Train (80%)
    model = ARIMA(
        train,
        order=best_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    model_fit = model.fit()

    # Tebak data Test (20%)
    forecast_test = model_fit.forecast(steps=len(test))

    # 2. PROYEKSI MASA DEPAN: Latih model ulang di seluruh data (100%)
    model_full = ARIMA(
        ts,
        order=best_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    model_full_fit = model_full.fit()

    # Tebak masa depan (1, 4, atau 12 minggu ke depan)
    forecast_future = model_full_fit.forecast(steps=steps)

    actual_test = test

    # 3. HITUNG METRIK EVALUASI AKURASI
    mae = float(mean_absolute_error(actual_test, forecast_test))
    mse = float(mean_squared_error(actual_test, forecast_test))
    rmse = float(np.sqrt(mse))
    
    # Hitung persentase kesalahan MAPE (Mean Absolute Percentage Error)
    mape = float(np.mean(np.abs(actual_test - forecast_test) / np.maximum(1, actual_test)) * 100)
    
    # Akurasi = 100% dikurangi kesalahan MAPE
    akurasi = max(0.0, min(100.0, 100.0 - mape))

except Exception as e:

    avg = max(1, int(round(np.mean(ts))))

    forecast_future = np.array([avg] * steps)

    labels_internal = generate_future_labels(periods[-1], steps)
    labels_display = [to_display_label(l) for l in labels_internal]

    result = {
        "mode": "weekly",
        "model_used": "Fallback",
        "prediksi": [int(v) for v in forecast_future],
        "labels_internal": labels_internal,
        "labels_display": labels_display,
        "stok_dibutuhkan": int(sum(forecast_future)),
        "evaluasi": None,
        "warning": str(e),
    }

    print("RESULT_JSON")

    print(json.dumps(result))

    sys.exit()


# BATASI NILAI PREDIKSI (Clamping)
# Mencegah nilai prediksi minus atau terlalu tinggi di luar nalar historis
forecast_clean = []
min_limit = max(1, int(np.mean(ts) * 0.1)) # Batas bawah: 10% dari rata-rata penjualan
max_limit = max(10, int(np.max(ts) * 2))    # Batas atas: 2x lipat penjualan tertinggi

for value in forecast_future:
    value = int(round(value))
    # Batasi nilai prediksi agar berada di dalam rentang [min_limit, max_limit]
    value = max(min_limit, value)
    value = min(max_limit, value)
    forecast_clean.append(value)


labels_internal = generate_future_labels(periods[-1], steps)
labels_display = [to_display_label(l) for l in labels_internal]


stok_dibutuhkan = int(sum(forecast_clean))


result = {
    "mode": "weekly",
    "model_used": "ARIMA",
    "order": list(best_order),
    "prediksi": forecast_clean,
    "labels_internal": labels_internal,
    "labels_display": labels_display,
    "stok_dibutuhkan": stok_dibutuhkan,
    "evaluasi": {
        "mae": round(mae, 3),
        "mse": round(mse, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 2) if mape is not None else None,
        "akurasi": round(akurasi, 2) if akurasi is not None else None,
    },
}

print("RESULT_JSON")

print(json.dumps(result))

sys.exit()
