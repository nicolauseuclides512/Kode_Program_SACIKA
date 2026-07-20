import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { ENDPOINTS } from "../api/endpoints";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Package,
  ArrowDown,
  ArrowUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowUpRight,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import {
  Chart as ChartJS,
  LineElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  BarElement,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, ArcElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, BarElement);

const EMPTY_SUMMARY = {
  catalog: { active_products: 0, total_stock: 0, critical_products: 0, critical_ratio: 0 },
  flow: {
    incoming_quantity: 0,
    outgoing_quantity: 0,
    transaction_count: 0,
    incoming_trend_percent: 0,
    outgoing_trend_percent: 0,
    distribution_efficiency_percent: 0,
  },
  weekly: [1, 2, 3, 4].map((week) => ({ week, incoming_quantity: 0, outgoing_quantity: 0 })),
  recent_transactions: [],
  critical_products: [],
  forecast_risk: { available_count: 0, high_count: 0, stale_count: 0, items: [] },
};

const Dashboard = () => {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const period = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = String(selectedMonth.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get(ENDPOINTS.dashboardSummary, { params: { period } });
      setSummary(response.data);
    } catch (error) {
      console.error(error);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const formatUnit = (value) => Number(value || 0).toLocaleString("id-ID");
  const trendValue = (value) => value === null ? "N/A" : `${Number(value) >= 0 ? "+" : ""}${value}%`;
  const weekly = summary.weekly || EMPTY_SUMMARY.weekly;
  const risk = summary.forecast_risk || EMPTY_SUMMARY.forecast_risk;

  const lineChartData = {
    labels: weekly.map((item) => `Pekan ${item.week}`),
    datasets: [
      {
        label: "Supply (Masuk)",
        data: weekly.map((item) => Number(item.incoming_quantity || 0)),
        borderColor: "rgb(220, 38, 38)",
        backgroundColor: "rgba(220, 38, 38, 0.03)",
        tension: 0.3,
        borderWidth: 2,
        fill: true,
      },
      {
        label: "Demand (Keluar)",
        data: weekly.map((item) => Number(item.outgoing_quantity || 0)),
        borderColor: "rgb(113, 113, 122)",
        backgroundColor: "rgba(113, 113, 122, 0.02)",
        tension: 0.3,
        borderWidth: 2,
        fill: true,
      },
    ],
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="h-8 w-8 animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-500 font-medium">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 bg-background">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
          <p className="text-sm text-zinc-500 mt-1">Ringkasan operasional dihitung langsung oleh backend.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[140px]">
            <Select value={String(selectedMonth.getMonth() + 1)} onValueChange={(value) => {
              const next = new Date(selectedMonth);
              next.setMonth(Number(value) - 1);
              setSelectedMonth(next);
            }}>
              <SelectTrigger className="h-9 border-zinc-200 bg-white"><SelectValue placeholder="Bulan" /></SelectTrigger>
              <SelectContent>
                {[
                  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
                ].map((name, index) => <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[100px]">
            <Select value={String(selectedMonth.getFullYear())} onValueChange={(value) => {
              const next = new Date(selectedMonth);
              next.setFullYear(Number(value));
              setSelectedMonth(next);
            }}>
              <SelectTrigger className="h-9 border-zinc-200 bg-white"><SelectValue placeholder="Tahun" /></SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026, 2027].map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="h-9 border-zinc-200">
            <RefreshCw className="mr-2 h-3.5 w-3.5 text-zinc-500" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4 p-4 rounded-xl border bg-zinc-50/50">
        <AlertCircle className="h-5 w-5 text-zinc-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-zinc-900">Peringatan Prediksi Persediaan Bulan Berikutnya</h4>
          {risk.available_count === 0 ? (
            <p className="text-xs text-zinc-500 mt-1">Belum tersedia hasil prediksi persediaan.</p>
          ) : risk.high_count === 0 ? (
            <p className="text-xs text-zinc-500 mt-1">Seluruh hasil prediksi terbaru berada di atas batas minimum.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-500">
                Terdapat <strong>{risk.high_count} produk</strong> berisiko tinggi.
                {risk.stale_count > 0 && <> <strong>{risk.stale_count} hasil</strong> kedaluwarsa.</>}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {risk.items.map((item) => (
                  <div key={`${item.produk_id}-${item.forecast_period}`} className="rounded-lg border bg-white px-3 py-2">
                    <p className="text-xs font-semibold truncate">{item.nama_produk}</p>
                    <p className="text-[10px] text-zinc-400 mt-1">{item.forecast_period} | {item.model_used} | {item.freshness === "stale" ? "Kedaluwarsa" : "Aktif"}</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Prediksi: <strong>{formatUnit(item.forecast_value)} unit</strong> / Minimum: <strong>{formatUnit(item.stok_minimum)} unit</strong></p>
                    {item.lower_bound !== null && item.upper_bound !== null && (
                      <p className="text-[10px] text-zinc-400 mt-1">Rentang indikatif: {formatUnit(item.lower_bound)}–{formatUnit(item.upper_bound)} unit</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Katalog Produk" value={formatUnit(summary.catalog.active_products)} icon={Package} note="Produk aktif terdaftar" />
        <MetricCard title="Volume Masuk" value={formatUnit(summary.flow.incoming_quantity)} icon={ArrowDown} trend={trendValue(summary.flow.incoming_trend_percent)} />
        <MetricCard title="Volume Keluar" value={formatUnit(summary.flow.outgoing_quantity)} icon={ArrowUp} trend={trendValue(summary.flow.outgoing_trend_percent)} />
        <MetricCard title="Aktivitas Transaksi" value={formatUnit(summary.flow.transaction_count)} icon={Calendar} note={`Transaksi periode ${period}`} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Arus Stok Mingguan</CardTitle><CardDescription className="text-xs">Dihitung di backend untuk periode terpilih.</CardDescription></CardHeader>
          <CardContent className="pl-2">
            <Line data={lineChartData} options={{ responsive: true, maintainAspectRatio: true, aspectRatio: 2.2, plugins: { legend: { position: "top", align: "end" } } }} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Transaksi Terbaru</CardTitle><CardDescription className="text-xs">Lima transaksi terbaru pada periode terpilih.</CardDescription></CardHeader>
          <CardContent>
            {summary.recent_transactions.length === 0 ? <EmptyText text="Belum ada transaksi pada periode ini" /> : (
              <div className="space-y-5">
                {summary.recent_transactions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div><p className="text-xs font-semibold">{item.nama_produk}</p><p className="text-[10px] text-zinc-400 mt-1">{new Date(item.tanggal).toLocaleDateString("id-ID")}</p></div>
                    <div className="text-right"><p className="text-xs font-bold">{item.jenis_transaksi === "masuk" ? "+" : "-"}{formatUnit(item.jumlah)} unit</p><p className="text-[9px] text-zinc-400">Rp {formatUnit(item.total)}</p></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-3 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Stok Kritis</CardTitle><CardDescription className="text-xs">Produk aktif dengan stok di bawah batas minimum.</CardDescription></CardHeader>
          <CardContent className="h-[250px] overflow-y-auto">
            {summary.critical_products.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2"><CheckCircle2 className="h-8 w-8 text-zinc-300" /><p className="text-xs font-semibold">Semua Stok Aman</p></div>
            ) : summary.critical_products.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 mb-2 rounded-lg border bg-zinc-50/30">
                <div><p className="text-xs font-semibold">{item.nama_produk}</p><p className="text-[10px] text-zinc-400">Batas: {formatUnit(item.stok_minimum)} unit</p></div>
                <span className="text-xs font-bold border bg-white px-2 py-1 rounded">{formatUnit(item.stok)} unit</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader><CardTitle className="text-base">Ringkasan Operasional Stok</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 text-center">
              <SummaryBox label="Total stok fisik" value={`${formatUnit(summary.catalog.total_stock)} unit`} />
              <SummaryBox label="Rasio stok kritis" value={`${summary.catalog.critical_ratio}%`} note={`${summary.catalog.critical_products} produk kritis`} />
            </div>
            <div className="mt-4 p-4 rounded-xl border bg-zinc-50/20 flex items-center justify-between">
              <div><p className="text-[10px] font-semibold text-zinc-400 uppercase">Efisiensi Distribusi</p><p className="text-[11px] text-zinc-500 mt-1">Rasio pengeluaran terhadap suplai masuk</p></div>
              <span className="text-2xl font-black">{summary.flow.distribution_efficiency_percent}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function MetricCard({ title, value, icon: Icon, note, trend }) {
  const numericTrend = trend && !trend.includes("N/A") ? Number(trend.replace("%", "")) : 0;
  return (
    <Card className="rounded-xl border border-zinc-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-xs font-semibold text-zinc-500 uppercase">{title}</CardTitle><Icon className="h-4 w-4 text-zinc-400" /></CardHeader>
      <CardContent><div className="text-3xl font-bold">{value}</div>{trend ? <span className="text-[11px] flex items-center mt-1 text-zinc-500">{numericTrend >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}{trend} dibanding bulan lalu</span> : <p className="text-[11px] text-zinc-400 mt-1">{note}</p>}</CardContent>
    </Card>
  );
}

function SummaryBox({ label, value, note }) {
  return <div className="p-4 rounded-xl border bg-zinc-50/20"><p className="text-[10px] font-semibold text-zinc-400 uppercase">{label}</p><p className="text-2xl font-black mt-1">{value}</p>{note && <p className="text-[10px] text-zinc-400 mt-1">{note}</p>}</div>;
}

function EmptyText({ text }) {
  return <div className="flex h-[250px] items-center justify-center text-xs text-zinc-400">{text}</div>;
}

export default Dashboard;
