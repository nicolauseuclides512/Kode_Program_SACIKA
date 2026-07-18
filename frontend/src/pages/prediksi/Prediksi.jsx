import { useEffect, useState } from "react";
import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  ShoppingCart,
  Calendar,
  Layers
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
  Filler
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
  Filler
);
const MONTHS_IND = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agst", "Sept", "Okt", "Nov", "Des"];

const getNextPeriodLabel = (currentLabel) => {
  if (!currentLabel) return "";
  const match = currentLabel.match(/^minggu\s+ke\s+(\d+)\s+(\w+)\s+(\d{4})$/i);
  if (match) {
    let [_, weekStr, monthStr, yearStr] = match;
    let week = parseInt(weekStr);
    let year = parseInt(yearStr);

    monthStr = monthStr.charAt(0).toUpperCase() + monthStr.slice(1).toLowerCase();
    let monthIdx = MONTHS_IND.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
    if (monthIdx === -1) {
      monthIdx = MONTHS_SHORT.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
    }
    if (monthIdx === -1) monthIdx = 0;

    if (week < 4) {
      week += 1;
    } else {
      week = 1;
      monthIdx += 1;
      if (monthIdx >= 12) {
        monthIdx = 0;
        year += 1;
      }
    }
    return `minggu ke ${week} ${MONTHS_IND[monthIdx]} ${year}`;
  }
  return currentLabel;
};

const Prediksi = () => {
  const [produk, setProduk] = useState([]);
  const [selectedProduk, setSelectedProduk] = useState(null);
  const [periode, setPeriode] = useState(1);

  // Forecast states
  const [forecastResult, setForecastResult] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [akurasi, setAkurasi] = useState(null);
  const [stokDibutuhkan, setStokDibutuhkan] = useState(0);
  const [trendAnalysis, setTrendAnalysis] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProduk();
  }, []);

  const fetchProduk = async () => {
    try {
      const res = await api.get(ENDPOINTS.produk);
      setProduk(res.data);
    } catch {
      setError("Gagal mengambil data produk");
    }
  };

  const productOptions = produk.map((p) => ({
    value: p.id,
    label: p.nama_produk,
    sublabel: `Stok saat ini: ${p.stok || 0} unit | Rp ${Number(p.harga).toLocaleString("id-ID")}`
  }));

  const clearForecastResults = () => {
    setForecastResult(null);
    setChartData(null);
    setAkurasi(null);
    setStokDibutuhkan(0);
    setTrendAnalysis(null);
    setError(null);
  };

  const handlePrediksi = async () => {
    if (!selectedProduk) {
      setError("Pilih produk terlebih dahulu");
      return;
    }
    setLoading(true);
    clearForecastResults();

    try {
      const res = await api.get(ENDPOINTS.prediksiChart(selectedProduk.value, periode));
      const data = res.data;

      const historicalData = data.historical || [];
      const forecastData = data.forecast || [];

      if (!forecastData || forecastData.length === 0) {
        throw new Error("Data proyeksi penjualan tidak tersedia");
      }

      setForecastResult(data);
      setAkurasi(data.evaluasi?.akurasi ?? null);
      setStokDibutuhkan(data.stok_dibutuhkan || 0);

      const uniqueHistoryMap = new Map();
      historicalData.forEach(h => {
        const period = h.period;
        const total = Number(h.total) || 0;
        if (uniqueHistoryMap.has(period)) {
          uniqueHistoryMap.set(period, uniqueHistoryMap.get(period) + total);
        } else {
          uniqueHistoryMap.set(period, total);
        }
      });

      const uniqueHistoricalData = Array.from(uniqueHistoryMap.entries()).map(([period, total]) => ({
        period,
        total
      }));

      let displayHistory = [];
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonthIdx = currentDate.getMonth();

      const getMonthYearString = (offset) => {
        const targetMonthIdx = currentMonthIdx + offset;
        const monthName = MONTHS_IND[targetMonthIdx % 12];
        const year = (currentYear - 1) + Math.floor(targetMonthIdx / 12);
        return `${monthName} ${year}`;
      };

      if (periode === 1) {
        const monthYearStr = getMonthYearString(0);
        const currentWeekNum = currentDate.getDate() <= 7 ? 1 : currentDate.getDate() <= 14 ? 2 : currentDate.getDate() <= 21 ? 3 : 4;
        displayHistory = uniqueHistoricalData.filter(h => h.period === `minggu ke ${currentWeekNum} ${monthYearStr}`);
      } else if (periode === 4) {
        const monthYearStr = getMonthYearString(0);
        displayHistory = uniqueHistoricalData.filter(h =>
          h.period.includes(monthYearStr)
        );
      } else if (periode === 12) {
        const myStr1 = getMonthYearString(0);
        const myStr2 = getMonthYearString(1);
        const myStr3 = getMonthYearString(2);
        displayHistory = uniqueHistoricalData.filter(h =>
          h.period.includes(myStr1) ||
          h.period.includes(myStr2) ||
          h.period.includes(myStr3)
        );
      }

      if (displayHistory.length === 0) {
        displayHistory = uniqueHistoricalData.slice(-periode);
      }

      const lastActualVal = displayHistory[displayHistory.length - 1]?.total ?? 0;
      const totalForecastVal = forecastData.reduce((sum, val) => sum + val, 0);
      const avgForecastVal = totalForecastVal / forecastData.length;

      let trendPercentage = 0;
      let trendDirection = "STABIL";
      if (lastActualVal > 0) {
        trendPercentage = ((avgForecastVal - lastActualVal) / lastActualVal) * 100;
        if (trendPercentage > 5) trendDirection = "NAIK";
        else if (trendPercentage < -5) trendDirection = "TURUN";
      }

      setTrendAnalysis({
        percentage: Math.abs(trendPercentage).toFixed(1),
        direction: trendDirection,
        lastActual: lastActualVal,
        avgForecast: avgForecastVal.toFixed(1)
      });

      const historicalLabels = displayHistory.map(h => h.period);
      const forecastLabels = historicalLabels.map(label => {
        const parts = label.split(" ");
        const yearIdx = parts.length - 1;
        const year = parseInt(parts[yearIdx]);
        if (!isNaN(year)) {
          parts[yearIdx] = String(year + 1);
          return parts.join(" ");
        }
        return label;
      });
      const allLabels = [...historicalLabels, ...forecastLabels];

      const actualSalesPoints = [
        ...displayHistory.map(h => h.total),
        ...Array(forecastData.length).fill(null)
      ];

      const predictedSalesPoints = [
        ...Array(displayHistory.length - 1).fill(null),
        lastActualVal,
        ...forecastData
      ];

      setChartData({
        labels: allLabels,
        datasets: [
          {
            label: "Penjualan Aktual",
            data: actualSalesPoints,
            borderColor: "rgba(63, 63, 70, 0.9)", // zinc-700
            backgroundColor: "transparent",
            borderWidth: 2,
            tension: 0.2,
            fill: false,
            pointRadius: 4,
            pointBackgroundColor: "rgba(63, 63, 70, 0.9)",
            pointHoverRadius: 6,
          },
          {
            label: `Proyeksi ARIMA`,
            data: predictedSalesPoints,
            borderColor: "rgba(220, 38, 38, 1)", // red-600
            backgroundColor: "rgba(220, 38, 38, 0.04)",
            borderWidth: 2.5,
            borderDash: [5, 4],
            tension: 0.2,
            fill: true,
            pointRadius: 4.5,
            pointBackgroundColor: "rgba(220, 38, 38, 1)",
            pointHoverRadius: 6.5,
          }
        ]
      });

    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message || "Terjadi kesalahan server";
      setError(message);
      console.error("Forecasting Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to rate the MAPE accuracy qualitative rating
  const getAccuracyRating = (mapeVal) => {
    const acc = mapeVal !== null ? Number(mapeVal) : null;
    if (acc === null) return { text: "N/A", color: "bg-zinc-50 text-zinc-600 border-zinc-200/60" };
    if (acc >= 90) return { text: "Sangat Tinggi", color: "bg-zinc-50 text-zinc-600 border-zinc-200/60" };
    if (acc >= 80) return { text: "Tinggi", color: "bg-zinc-50 text-zinc-600 border-zinc-200/60" };
    if (acc >= 70) return { text: "Cukup Andal", color: "bg-zinc-50 text-zinc-600 border-zinc-200/60" };
    return { text: "Rendah", color: "bg-zinc-50 text-zinc-600 border-zinc-200/60" };
  };

  const accuracyRating = getAccuracyRating(akurasi);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 bg-white min-h-screen">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">
            Prediksi Permintaan Penjualan
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-xl">
            Analisis runtun waktu untuk memproyeksikan permintaan mingguan dan mengoptimalkan level persediaan.
          </p>
        </div>
      </div>

      {/* Configuration Controls */}
      <Card className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6 space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
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
                  stok: selected.stok
                } : null);
              }}
              placeholder="Cari & pilih produk..."
              searchPlaceholder="Masukkan nama produk..."
            />
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              Jangka Waktu Prediksi
            </label>
            <Select value={String(periode)} onValueChange={(value) => {
              setPeriode(Number(value));
              clearForecastResults();
            }}>
              <SelectTrigger className="border-zinc-200 h-9 bg-white text-sm font-medium text-zinc-900 rounded-lg">
                <SelectValue placeholder="Pilih horizon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Minggu Ke Depan</SelectItem>
                <SelectItem value="4">4 Minggu Ke Depan</SelectItem>
                <SelectItem value="12">12 Minggu Ke Depan (3 Bulan)</SelectItem>
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
                <>
                  Mulai Prediksi
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 text-xs text-red-600 bg-red-50/50 p-3.5 rounded-xl border border-red-100 mt-4">
            <div className="space-y-0.5">
              <p className="font-bold">Gagal melakukan prediksi</p>
              <p className="text-red-500/90">{error}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Main Analysis and Visualization Panel */}
      {forecastResult && (
        <div className="space-y-6">
          {/* Metrics Grid Row */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Card 1: MAPE Accuracy */}
            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Akurasi Prediksi
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-zinc-900">
                  {akurasi !== null ? `${Number(akurasi).toFixed(2)}%` : "N/A"}
                </span>
              </div>
              <div className="mt-2 flex items-center">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${accuracyRating.color}`}>
                  {accuracyRating.text}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                Tingkat presisi model berdasarkan data histori.
              </p>
            </Card>

            {/* Card 2: Proyeksi Tren */}
            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Tren Permintaan
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-zinc-900">
                  {trendAnalysis?.direction === "NAIK" ? "Meningkat" : trendAnalysis?.direction === "TURUN" ? "Menurun" : "Stabil"}
                </span>
                {trendAnalysis?.percentage > 0 && (
                  <span className="text-xs font-bold text-zinc-500 ml-1">
                    ({trendAnalysis?.direction === "NAIK" ? "+" : "-"}{trendAnalysis?.percentage}%)
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
                  Rata-rata: {trendAnalysis?.avgForecast} unit/minggu
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                Arah pergeseran volume penjualan ke depan.
              </p>
            </Card>

            {/* Card 3: Prediksi Stok Dibutuhkan */}
            <Card className="rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Kebutuhan Stok
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-zinc-900">
                  {Number(stokDibutuhkan || 0).toLocaleString("id-ID")}
                </span>
                <span className="text-xs font-semibold text-zinc-400 ml-1">Unit</span>
              </div>
              <div className="mt-2">
                {selectedProduk && (selectedProduk.stok || 0) < stokDibutuhkan ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-50 text-zinc-600 border-zinc-200">
                    ⚠️ Butuh Restock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border bg-zinc-50 text-zinc-600 border-zinc-200">
                    ✓ Stok Aman
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-3">
                Target suplai aman untuk menghindari kekosongan.
              </p>
            </Card>
          </div>

          {/* Visualization and Recommendations Row */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Visualisasi Chart (8 Columns) - FIXED: maintainAspectRatio: true + aspectRatio: 2.4 prevents blurry stretching */}
            <Card className="xl:col-span-8 rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <CardHeader className="p-0 mb-3 select-none">
                <CardTitle className="text-lg font-bold text-zinc-900">Visualisasi Proyeksi ARIMA</CardTitle>
                <CardDescription className="text-xs text-zinc-400 mt-0.5">
                  Grafik gabungan antara histori penjualan mingguan (aktual) dengan peramalan cerdas ARIMA (proyeksi masa depan).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 mt-3">
                <div className="relative w-full">
                  {chartData && (
                    <Line
                      data={chartData}
                      redraw={true}
                      options={{
                        responsive: true,
                        maintainAspectRatio: true, // Let ChartJS calculate clean DPI height to avoid blurriness
                        aspectRatio: 2.4, // Perfect ratio lock for widescreen desktops
                        interaction: {
                          mode: 'index',
                          intersect: false,
                        },
                        plugins: {
                          legend: {
                            display: true,
                            position: 'top',
                            labels: {
                              boxWidth: 10,
                              font: { size: 10, weight: '600' },
                              usePointStyle: true,
                              pointStyle: 'circle'
                            }
                          },
                          tooltip: {
                            padding: 10,
                            bodyFont: { size: 11 },
                            titleFont: { size: 11, weight: '700' },
                            backgroundColor: 'rgba(9, 9, 11, 0.95)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            usePointStyle: true,
                            callbacks: {
                              label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                  label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                  label += `${Math.round(context.parsed.y)} unit`;
                                }
                                return label;
                              }
                            }
                          }
                        },
                        scales: {
                          y: {
                            grid: { color: "rgba(0, 0, 0, 0.03)" },
                            ticks: {
                              font: { size: 10, weight: '500' },
                              color: '#71717a'
                            }
                          },
                          x: {
                            grid: { display: false },
                            ticks: {
                              font: { size: 10, weight: '600' },
                              color: '#52525b',
                              maxRotation: 0,
                              minRotation: 0
                            }
                          }
                        }
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Rekomendasi Panel (4 Columns) */}
            <Card className="xl:col-span-4 rounded-2xl border border-zinc-150 bg-white p-5 shadow-2xs">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 select-none border-b border-zinc-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">Rekomendasi Pengadaan</h3>
                    <p className="text-[10px] text-zinc-400 mt-0.5">Panduan aksi cepat persediaan</p>
                  </div>
                </div>

                {/* Single, minimalist direct action advisory box */}
                <div className="p-4 rounded-xl border leading-relaxed text-xs font-medium bg-zinc-50/50 border-zinc-200 text-zinc-700">
                  <div className="flex gap-2">
                    <div>
                      <span className="font-bold text-zinc-900 block mb-1">
                        {(selectedProduk?.stok || 0) < stokDibutuhkan ? "⚠️ Tindakan Restock Diperlukan" : "✓ Persediaan Saat Ini Aman"}
                      </span>

                      {(selectedProduk?.stok || 0) < stokDibutuhkan ? (
                        <>
                          Stok saat ini (<strong className="text-zinc-900">{selectedProduk?.stok || 0} unit</strong>) lebih kecil dari total proyeksi permintaan (<strong className="text-zinc-900">{stokDibutuhkan} unit</strong>) untuk {periode} minggu mendatang.
                          <p className="mt-2 text-zinc-800 font-bold">
                            Disarankan segera memasan suplai baru minimal sebanyak <span className="underline font-extrabold text-zinc-950">{stokDibutuhkan - (selectedProduk?.stok || 0)} unit</span>.
                          </p>
                        </>
                      ) : (
                        <>
                          Persediaan saat ini (<strong className="text-zinc-900">{selectedProduk?.stok || 0} unit</strong>) memadai untuk melayani proyeksi permintaan (<strong className="text-zinc-900">{stokDibutuhkan} unit</strong>) dalam {periode} minggu mendatang.
                          <p className="mt-2 text-zinc-500 font-normal">
                            Tidak diperlukan pesanan tambahan segera.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-zinc-100 flex items-center justify-between">
                <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1 select-none">
                  Rekomendasi asisten operasional.
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default Prediksi;
