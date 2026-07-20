import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Info,
  Layers,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);


const FRESHNESS_COPY = {
  current: {
    label: "Aktif",
    className: "bg-emerald-50 text-emerald-700 border-emerald-100",
    description: "Hasil menggunakan snapshot terbaru yang tersedia.",
  },
  stale: {
    label: "Kedaluwarsa",
    className: "bg-amber-50 text-amber-700 border-amber-100",
    description: "Terdapat snapshot baru setelah cutoff model. Jalankan prediksi ulang.",
  },
  superseded: {
    label: "Tergantikan",
    className: "bg-zinc-50 text-zinc-600 border-zinc-200",
    description: "Hasil ini telah digantikan oleh forecast yang lebih baru.",
  },
};

const STATUS_COPY = {
  not_eligible: {
    title: "Produk tidak eligible untuk forecasting",
    className: "text-amber-700 bg-amber-50/70 border-amber-100",
  },
  worker_unavailable: {
    title: "Worker forecasting tidak tersedia",
    className: "text-red-700 bg-red-50/70 border-red-100",
  },
  data_incomplete: {
    title: "Data histori belum lengkap",
    className: "text-amber-700 bg-amber-50/70 border-amber-100",
  },
  error: {
    title: "Gagal melakukan prediksi",
    className: "text-red-700 bg-red-50/70 border-red-100",
  },
};

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUnit(value, digits = 0) {
  const numericValue = toNumberOrNull(value);
  if (numericValue === null) return "N/A";

  return numericValue.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatMetric(value, suffix = "") {
  const numericValue = toNumberOrNull(value);
  if (numericValue === null) return "N/A";

  return `${numericValue.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${suffix}`;
}

function normalizeWarnings(result) {
  const warnings = [];

  if (Array.isArray(result?.warning)) {
    warnings.push(...result.warning);
  } else if (result?.warning) {
    warnings.push(result.warning);
  }

  if (Array.isArray(result?.quality?.messages)) {
    warnings.push(...result.quality.messages.filter((message) => {
      return message && message !== "Data layak untuk analisis awal";
    }));
  }

  return Array.from(new Set(warnings));
}

function getLastObservedValue(history) {
  const values = history?.values || [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = toNumberOrNull(values[index]);
    if (value !== null) return value;
  }

  return null;
}

function buildChartData(history, forecastResult) {
  const historyPeriods = history?.periods || [];
  const historyValues = history?.values || [];
  const forecastPeriods = forecastResult?.forecast_periods || [];
  const forecastValues = (forecastResult?.forecast_values || []).map(toNumberOrNull);
  const lastObservedValue = getLastObservedValue(history);

  const labels = [...historyPeriods, ...forecastPeriods];
  const actualPoints = [
    ...historyValues.map(toNumberOrNull),
    ...Array(forecastPeriods.length).fill(null),
  ];
  const predictedPoints = historyPeriods.length > 0
    ? [
      ...Array(historyPeriods.length - 1).fill(null),
      lastObservedValue,
      ...forecastValues,
    ]
    : forecastValues;

  return {
    labels,
    datasets: [
      {
        label: "Histori Persediaan",
        data: actualPoints,
        borderColor: "rgba(63, 63, 70, 0.9)",
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.2,
        fill: false,
        pointRadius: 4,
        pointBackgroundColor: "rgba(63, 63, 70, 0.9)",
        pointHoverRadius: 6,
      },
      {
        label: "Prediksi Model Terpilih",
        data: predictedPoints,
        borderColor: "rgba(220, 38, 38, 1)",
        backgroundColor: "rgba(220, 38, 38, 0.04)",
        borderWidth: 2.5,
        borderDash: [5, 4],
        tension: 0.2,
        fill: true,
        pointRadius: 4.5,
        pointBackgroundColor: "rgba(220, 38, 38, 1)",
        pointHoverRadius: 6.5,
      },
    ],
  };
}

function getTrendAnalysis(history, forecastResult) {
  const lastObservedValue = getLastObservedValue(history);
  const firstForecastValue = toNumberOrNull(forecastResult?.forecast_values?.[0]);

  if (lastObservedValue === null || firstForecastValue === null) {
    return {
      direction: "Tidak tersedia",
      percentage: null,
      description: "Histori valid belum cukup untuk menghitung arah perubahan.",
    };
  }

  if (lastObservedValue === 0) {
    return {
      direction: firstForecastValue > 0 ? "Meningkat" : "Stabil",
      percentage: null,
      description: `Nilai histori terakhir ${formatUnit(lastObservedValue)} unit.`,
    };
  }

  const change = ((firstForecastValue - lastObservedValue) / lastObservedValue) * 100;
  const direction = change > 5 ? "Meningkat" : change < -5 ? "Menurun" : "Stabil";

  return {
    direction,
    percentage: Math.abs(change),
    description: `Dibanding observasi terakhir ${formatUnit(lastObservedValue)} unit.`,
  };
}

function getRiskStatus(forecastValue, stokMinimum) {
  const forecast = toNumberOrNull(forecastValue);
  const minimum = toNumberOrNull(stokMinimum);

  if (forecast === null || minimum === null) {
    return {
      isRisk: false,
      text: "Batas minimum produk belum tersedia",
      className: "bg-zinc-50 text-zinc-600 border-zinc-200",
    };
  }

  if (forecast <= minimum) {
    return {
      isRisk: true,
      text: "Prediksi persediaan berada di bawah batas minimum",
      className: "bg-red-50 text-red-700 border-red-100",
    };
  }

  return {
    isRisk: false,
    text: "Prediksi persediaan masih berada di atas batas minimum",
    className: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
}

function classifyError(error) {
  const status = error.response?.status;
  const message = error.response?.data?.message
    || error.response?.data?.error
    || error.message
    || "Terjadi kesalahan server";

  if (status === 422) {
    return {
      status: "not_eligible",
      message,
      details: error.response?.data?.details,
    };
  }

  if (status === 503) {
    return {
      status: "worker_unavailable",
      message,
      details: error.response?.data?.details,
    };
  }

  if (status === 404) {
    return {
      status: "data_incomplete",
      message,
      details: error.response?.data?.details,
    };
  }

  return {
    status: "error",
    message,
    details: error.response?.data?.details,
  };
}

const Prediksi = () => {
  const [produk, setProduk] = useState([]);
  const [selectedProduk, setSelectedProduk] = useState(null);
  const [horizon, setHorizon] = useState(1);
  const [forecastResult, setForecastResult] = useState(null);
  const [historyResult, setHistoryResult] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(null);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    const fetchProduk = async () => {
      try {
        const res = await api.get(ENDPOINTS.produk, { params: { all: true, status: "active" } });
        setProduk(res.data);
      } catch {
        setStatus("error");
        setMessage("Gagal mengambil data produk");
      }
    };

    fetchProduk();
  }, []);

  const productOptions = produk.map((p) => ({
    value: p.id,
    label: p.nama_produk,
    sublabel: `Stok saat ini: ${p.stok || 0} unit | Minimum: ${p.stok_minimum || 0} unit`,
  }));

  const clearForecastResults = () => {
    setForecastResult(null);
    setHistoryResult(null);
    setChartData(null);
    setStatus("idle");
    setMessage(null);
    setDetails(null);
  };

  const handlePrediksi = async () => {
    if (!selectedProduk) {
      setStatus("error");
      setMessage("Pilih produk terlebih dahulu");
      return;
    }

    setLoading(true);
    clearForecastResults();

    try {
      const historyResponse = await api.get(ENDPOINTS.inventoryHistory(selectedProduk.value));
      const forecastResponse = await api.post(
        ENDPOINTS.inventoryForecast(selectedProduk.value),
        { horizon },
      );

      const forecast = forecastResponse.data;
      const history = historyResponse.data;

      if (!Array.isArray(forecast.forecast_periods) || forecast.forecast_periods.length === 0) {
        throw new Error("Periode prediksi tidak tersedia dari API");
      }

      if (!Array.isArray(forecast.forecast_values) || forecast.forecast_values.length === 0) {
        throw new Error("Nilai prediksi tidak tersedia dari API");
      }

      setForecastResult(forecast);
      setHistoryResult(history);
      setChartData(buildChartData(history, forecast));
      setStatus("success");
    } catch (error) {
      const classified = classifyError(error);
      setStatus(classified.status);
      setMessage(classified.message);
      setDetails(classified.details);
      console.error("Forecasting Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedForecastValue = toNumberOrNull(forecastResult?.forecast_values?.[0]);
  const selectedForecastPeriod = forecastResult?.forecast_periods?.[0] || "-";
  const observationCount = forecastResult?.quality?.observation_count
    ?? historyResult?.observation_count
    ?? 0;
  const evaluation = forecastResult?.evaluation || {};
  const warnings = useMemo(() => normalizeWarnings(forecastResult), [forecastResult]);
  const trendAnalysis = useMemo(
    () => getTrendAnalysis(historyResult, forecastResult),
    [historyResult, forecastResult],
  );
  const riskStatus = getRiskStatus(selectedForecastValue, selectedProduk?.stok_minimum);
  const forecastRows = (forecastResult?.forecast_periods || []).map((period, index) => {
    const range = forecastResult?.forecast_ranges?.[index] || {};
    return {
      period,
      value: toNumberOrNull(forecastResult?.forecast_values?.[index]),
      lowerBound: toNumberOrNull(range.lower_bound),
      upperBound: toNumberOrNull(range.upper_bound),
    };
  });
  const selectedForecastRange = forecastRows[0] || {};
  const freshnessCopy = FRESHNESS_COPY[forecastResult?.freshness] || FRESHNESS_COPY.current;
  const candidateModels = Array.isArray(forecastResult?.candidate_models)
    ? forecastResult.candidate_models
    : [];
  const backtestRows = Array.isArray(forecastResult?.backtest)
    ? forecastResult.backtest
    : [];
  const historyPeriods = historyResult?.periods || [];
  const historyCutoff = historyPeriods.length > 0
    ? historyPeriods[historyPeriods.length - 1]
    : "-";
  const stateCopy = STATUS_COPY[status];

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 bg-white min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-zinc-900">
            Prediksi Posisi Persediaan Bulanan
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-xl">
            Analisis runtun waktu untuk mengestimasi posisi persediaan akhir bulan.
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6 space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
              Pilih Produk Koperasi
            </label>
            <SearchableSelect
              options={productOptions}
              value={selectedProduk?.value ? String(selectedProduk.value) : ""}
              onValueChange={(value) => {
                clearForecastResults();
                if (!value) {
                  setSelectedProduk(null);
                  return;
                }

                const selected = produk.find((p) => p.id === Number(value));
                setSelectedProduk(selected ? {
                  value: selected.id,
                  nama_produk: selected.nama_produk,
                  harga: selected.harga,
                  stok: selected.stok,
                  stok_minimum: selected.stok_minimum,
                } : null);
              }}
              placeholder="Cari & pilih produk..."
              searchPlaceholder="Masukkan nama produk..."
            />
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
              Horizon Prediksi
            </label>
            <Select value={String(horizon)} onValueChange={(value) => {
              setHorizon(Number(value));
              clearForecastResults();
            }}>
              <SelectTrigger className="border-zinc-200 h-9 bg-white text-sm font-medium text-zinc-900 rounded-lg">
                <SelectValue placeholder="Pilih horizon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Bulan</SelectItem>
                <SelectItem value="3">3 Bulan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-3">
            <Button
              onClick={handlePrediksi}
              disabled={loading || !selectedProduk}
              className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 border-primary rounded-lg text-sm font-bold shadow-xs mt-2 transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Mulai Prediksi"
              )}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="flex items-start gap-3 text-xs text-zinc-600 bg-zinc-50/70 p-3.5 rounded-xl border border-zinc-100 mt-4">
            <RefreshCw className="w-4 h-4 animate-spin mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">Memproses histori persediaan</p>
              <p className="text-zinc-500">Backend sedang memvalidasi data dan memanggil worker forecasting.</p>
            </div>
          </div>
        )}

        {stateCopy && !loading && (
          <div className={`flex items-start gap-3 text-xs p-3.5 rounded-xl border mt-4 ${stateCopy.className}`}>
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">{stateCopy.title}</p>
              <p>{message}</p>
              {details?.observation_count !== undefined && (
                <p>
                  Observasi valid: <strong>{details.observation_count}</strong>
                  {details.minimum_observation_count !== undefined && (
                    <> dari minimum <strong>{details.minimum_observation_count}</strong></>
                  )}
                </p>
              )}
              {Array.isArray(details?.messages) && details.messages.length > 0 && (
                <p>{details.messages.join("; ")}</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {forecastResult && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 text-xs text-zinc-600 flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-zinc-500" />
            <div className="space-y-2">
              <p>
                Hasil ini merupakan estimasi posisi persediaan akhir bulan, bukan prediksi penjualan atau rekomendasi jumlah pembelian.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-md border ${freshnessCopy.className}`}>
                  Status hasil: {freshnessCopy.label}
                </span>
                <span className="text-[11px] text-zinc-500">{freshnessCopy.description}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Nama Produk
                </span>
                <Layers className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-extrabold text-zinc-900 leading-tight">
                  {selectedProduk?.nama_produk || "-"}
                </p>
                <p className="text-xs text-zinc-400">
                  Jumlah observasi: {observationCount} bulan
                </p>
              </div>
            </Card>

            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Prediksi Model Terpilih
                </span>
                <SparklineIcon />
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-extrabold text-zinc-900">
                  {forecastResult.model_used || "N/A"}
                </p>
                <p className="text-xs text-zinc-400">
                  Periode cutoff data: {forecastResult.data_cutoff || historyCutoff}
                </p>
              </div>
            </Card>

            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Evaluasi Model
                </span>
                <CheckCircle2 className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold">MAE</p>
                  <p className="text-lg font-extrabold text-zinc-900">{formatMetric(evaluation.mae)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold">RMSE</p>
                  <p className="text-lg font-extrabold text-zinc-900">{formatMetric(evaluation.rmse)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400 font-semibold">WAPE</p>
                  <p className="text-lg font-extrabold text-zinc-900">{formatMetric(evaluation.wape, "%")}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                Dihitung dari rolling-origin validation.
              </p>
            </Card>

            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Estimasi Persediaan Akhir
                </span>
                <Calendar className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-zinc-900">
                  {formatUnit(selectedForecastValue, 2)}
                </span>
                <span className="text-xs font-semibold text-zinc-400 ml-1">Unit</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Periode prediksi: {selectedForecastPeriod}
              </p>
              {selectedForecastRange.lowerBound !== null && selectedForecastRange.upperBound !== null && (
                <p className="text-[11px] text-zinc-500 mt-2">
                  Rentang indikatif: <strong>{formatUnit(selectedForecastRange.lowerBound, 2)}–{formatUnit(selectedForecastRange.upperBound, 2)} unit</strong>
                </p>
              )}
              <span className={`inline-flex mt-3 text-[10px] font-bold px-2 py-0.5 rounded-md border ${riskStatus.className}`}>
                {riskStatus.text}
              </span>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <Card className="xl:col-span-8 rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <CardHeader className="p-0 mb-3 select-none">
                <CardTitle className="text-lg font-bold text-zinc-900">Tren Posisi Persediaan</CardTitle>
                <CardDescription className="text-xs text-zinc-400 mt-0.5">
                  Grafik histori persediaan bulanan dan hasil prediksi dari model terpilih.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 mt-3">
                <div className="relative w-full">
                  {chartData && (
                    <Line
                      data={chartData}
                      redraw
                      options={{
                        responsive: true,
                        maintainAspectRatio: true,
                        aspectRatio: 2.4,
                        interaction: {
                          mode: "index",
                          intersect: false,
                        },
                        plugins: {
                          legend: {
                            display: true,
                            position: "top",
                            labels: {
                              boxWidth: 10,
                              font: { size: 10, weight: "600" },
                              usePointStyle: true,
                              pointStyle: "circle",
                            },
                          },
                          tooltip: {
                            padding: 10,
                            bodyFont: { size: 11 },
                            titleFont: { size: 11, weight: "700" },
                            backgroundColor: "rgba(9, 9, 11, 0.95)",
                            borderColor: "rgba(255, 255, 255, 0.1)",
                            borderWidth: 1,
                            usePointStyle: true,
                            callbacks: {
                              label(context) {
                                let label = context.dataset.label || "";
                                if (label) label += ": ";
                                if (context.parsed.y !== null) {
                                  label += `${Math.round(context.parsed.y)} unit`;
                                }
                                return label;
                              },
                            },
                          },
                        },
                        scales: {
                          y: {
                            grid: { color: "rgba(0, 0, 0, 0.03)" },
                            ticks: {
                              font: { size: 10, weight: "500" },
                              color: "#71717a",
                            },
                          },
                          x: {
                            grid: { display: false },
                            ticks: {
                              font: { size: 10, weight: "600" },
                              color: "#52525b",
                              maxRotation: 0,
                              minRotation: 0,
                            },
                          },
                        },
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-4 rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 select-none border-b border-zinc-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Status Risiko Persediaan</h3>
                    <p className="text-[10px] text-zinc-400 mt-0.5">Berdasarkan batas minimum produk</p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border leading-relaxed text-xs font-medium ${riskStatus.className}`}>
                  <span className="font-bold block mb-1">
                    {riskStatus.text}
                  </span>
                  <p>
                    Prediksi {selectedForecastPeriod}: <strong>{formatUnit(selectedForecastValue, 2)} unit</strong>.
                    Batas minimum: <strong>{formatUnit(selectedProduk?.stok_minimum, 2)} unit</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 text-xs text-zinc-700">
                  <div className="flex items-start gap-2">
                    {trendAnalysis.direction === "Menurun" ? (
                      <TrendingDown className="w-4 h-4 mt-0.5 text-zinc-500" />
                    ) : (
                      <TrendingUp className="w-4 h-4 mt-0.5 text-zinc-500" />
                    )}
                    <div>
                      <p className="font-bold text-zinc-900">Tren Posisi Persediaan</p>
                      <p className="mt-1">
                        {trendAnalysis.direction}
                        {trendAnalysis.percentage !== null && (
                          <> ({formatMetric(trendAnalysis.percentage, "%")})</>
                        )}
                      </p>
                      <p className="text-zinc-500 mt-1">{trendAnalysis.description}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase">Periode Prediksi</p>
                  <div className="space-y-2">
                    {forecastRows.map((row) => (
                      <div
                        key={row.period}
                        className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-zinc-700">{row.period}</span>
                        <div className="text-right">
                          <span className="block font-bold text-zinc-900">{formatUnit(row.value, 2)} unit</span>
                          {row.lowerBound !== null && row.upperBound !== null && (
                            <span className="block text-[10px] text-zinc-400">
                              indikatif {formatUnit(row.lowerBound, 2)}–{formatUnit(row.upperBound, 2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/70 text-xs text-amber-800">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold">Warning kualitas data</p>
                        <ul className="mt-2 space-y-1">
                          {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <CardHeader className="p-0 mb-3">
                <CardTitle className="text-base font-bold text-zinc-900">Perbandingan Kandidat Model</CardTitle>
                <CardDescription className="text-xs text-zinc-400">Disimpan bersama setiap forecast run.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-zinc-400">
                      <th className="py-2">Model</th>
                      <th className="py-2">MAE</th>
                      <th className="py-2">RMSE</th>
                      <th className="py-2">WAPE</th>
                      <th className="py-2">Titik Uji</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateModels.map((candidate, index) => (
                      <tr key={`${candidate.model}-${index}`} className="border-b border-zinc-50">
                        <td className="py-2 font-semibold text-zinc-800">{candidate.model}</td>
                        <td className="py-2">{formatMetric(candidate.mae)}</td>
                        <td className="py-2">{formatMetric(candidate.rmse)}</td>
                        <td className="py-2">{formatMetric(candidate.wape, "%")}</td>
                        <td className="py-2">{candidate.test_points ?? "-"}</td>
                      </tr>
                    ))}
                    {candidateModels.length === 0 && (
                      <tr><td colSpan="5" className="py-4 text-center text-zinc-400">Detail kandidat model belum tersedia.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <CardHeader className="p-0 mb-3">
                <CardTitle className="text-base font-bold text-zinc-900">Hasil Backtesting</CardTitle>
                <CardDescription className="text-xs text-zinc-400">Rolling-origin validation model terpilih.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-zinc-400">
                      <th className="py-2">Periode</th>
                      <th className="py-2">Aktual</th>
                      <th className="py-2">Prediksi</th>
                      <th className="py-2">Error Absolut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtestRows.map((row) => (
                      <tr key={row.period} className="border-b border-zinc-50">
                        <td className="py-2 font-semibold text-zinc-800">{row.period}</td>
                        <td className="py-2">{formatUnit(row.actual, 2)}</td>
                        <td className="py-2">{formatUnit(row.predicted, 2)}</td>
                        <td className="py-2">{formatUnit(row.absolute_error ?? Math.abs(Number(row.actual) - Number(row.predicted)), 2)}</td>
                      </tr>
                    ))}
                    {backtestRows.length === 0 && (
                      <tr><td colSpan="4" className="py-4 text-center text-zinc-400">Detail backtesting belum tersedia.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-white p-4 text-[11px] text-zinc-500">
            Rentang indikatif dihitung dari nilai prediksi ± MAE historis dan bukan confidence interval statistik.
          </div>
        </div>
      )}
    </div>
  );
};

function SparklineIcon() {
  return <TrendingUp className="w-4 h-4 text-zinc-400" />;
}

export default Prediksi;
