import { useEffect, useState } from "react";
import api from "../api/axios";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Package,
  ArrowDown,
  ArrowUp,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Calendar,
  ArrowUpRight,
  TrendingDown,
  RefreshCw
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
  BarElement
} from "chart.js";

import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, ArcElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, BarElement);

const Dashboard = () => {
  const [produk, setProduk] = useState([]);
  const [transaksi, setTransaksi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resProduk = await api.get("/produk");
      const resTransaksi = await api.get("/transaksi");
      setProduk(resProduk.data);
      setTransaksi(resTransaksi.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatBulan = (date) => {
    return date.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
  };

  const formatMonthForFilter = (date) => {
    return date.toISOString().slice(0, 7);
  };

  const transaksiBulan = transaksi.filter((t) => {
    const bulan = new Date(t.tanggal).toISOString().slice(0, 7);
    return bulan === formatMonthForFilter(selectedMonth);
  });

  const transaksiMasuk = transaksiBulan.filter((t) => t.jenis_transaksi === "masuk");
  const transaksiKeluar = transaksiBulan.filter((t) => t.jenis_transaksi === "keluar");

  
  const previousMonth = new Date(selectedMonth);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const transaksiBulanLalu = transaksi.filter((t) => {
    const bulan = new Date(t.tanggal).toISOString().slice(0, 7);
    return bulan === formatMonthForFilter(previousMonth);
  });
  const transaksiMasukLalu = transaksiBulanLalu.filter((t) => t.jenis_transaksi === "masuk");
  const transaksiKeluarLalu = transaksiBulanLalu.filter((t) => t.jenis_transaksi === "keluar");

  const totalMasuk = transaksiMasuk.reduce((sum, item) => sum + Number(item.jumlah), 0);
  const totalKeluar = transaksiKeluar.reduce((sum, item) => sum + Number(item.jumlah), 0);
  const totalMasukLalu = transaksiMasukLalu.reduce((sum, item) => sum + Number(item.jumlah), 0);
  const totalKeluarLalu = transaksiKeluarLalu.reduce((sum, item) => sum + Number(item.jumlah), 0);

  const totalStok = produk.reduce((sum, item) => sum + Number(item.stok), 0);
  const stokMinimum = produk.filter((p) => Number(p.stok) <= Number(p.stok_minimum));

  
  const restockArima = produk.filter((p) => {
    const avgWeeklySales = transaksi
      .filter((t) => t.id_produk === p.id && t.jenis_transaksi === "keluar")
      .reduce((sum, t) => sum + Number(t.jumlah), 0) / 4;
    return Number(p.stok) < (avgWeeklySales * 1.5);
  });

  const trendMasuk = totalMasukLalu > 0 ? (((totalMasuk - totalMasukLalu) / totalMasukLalu) * 100).toFixed(1) : 0;
  const trendKeluar = totalKeluarLalu > 0 ? (((totalKeluar - totalKeluarLalu) / totalKeluarLalu) * 100).toFixed(1) : 0;

  
  const recentTransactions = [...transaksiBulan]
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
    .slice(0, 5);

  
  const getWeekIndex = (dateStr) => {
    const day = new Date(dateStr).getDate();
    if (day <= 7) return 0;
    if (day <= 14) return 1;
    if (day <= 21) return 2;
    return 3;
  };

  const weeklyMasuk = [0, 0, 0, 0];
  const weeklyKeluar = [0, 0, 0, 0];

  transaksiMasuk.forEach((t) => {
    const wIdx = getWeekIndex(t.tanggal);
    weeklyMasuk[wIdx] += Number(t.jumlah);
  });

  transaksiKeluar.forEach((t) => {
    const wIdx = getWeekIndex(t.tanggal);
    weeklyKeluar[wIdx] += Number(t.jumlah);
  });

  
  const lineChartData = {
    labels: ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4"],
    datasets: [
      {
        label: "Supply (Masuk)",
        data: weeklyMasuk,
        borderColor: "rgb(220, 38, 38)",
        backgroundColor: "rgba(220, 38, 38, 0.03)",
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: "rgb(220, 38, 38)",
        pointHoverRadius: 5,
        fill: true,
      },
      {
        label: "Demand (Keluar)",
        data: weeklyKeluar,
        borderColor: "rgb(113, 113, 122)", 
        backgroundColor: "rgba(113, 113, 122, 0.02)",
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: "rgb(113, 113, 122)",
        pointHoverRadius: 5,
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
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Pantau arus stok koperasi dan rekomendasi restok persediaan barang.
          </p>
        </div>

        {}
        <div className="flex flex-wrap items-center gap-3">
          {}
          <div className="w-[140px]">
            <Select
              value={String(selectedMonth.getMonth() + 1)}
              onValueChange={(val) => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(Number(val) - 1);
                setSelectedMonth(newDate);
              }}
            >
              <SelectTrigger className="h-9 border-zinc-200 bg-white">
                <SelectValue placeholder="Bulan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Januari</SelectItem>
                <SelectItem value="2">Februari</SelectItem>
                <SelectItem value="3">Maret</SelectItem>
                <SelectItem value="4">April</SelectItem>
                <SelectItem value="5">Mei</SelectItem>
                <SelectItem value="6">Juni</SelectItem>
                <SelectItem value="7">Juli</SelectItem>
                <SelectItem value="8">Agustus</SelectItem>
                <SelectItem value="9">September</SelectItem>
                <SelectItem value="10">Oktober</SelectItem>
                <SelectItem value="11">November</SelectItem>
                <SelectItem value="12">Desember</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {}
          <div className="w-[100px]">
            <Select
              value={String(selectedMonth.getFullYear())}
              onValueChange={(val) => {
                const newDate = new Date(selectedMonth);
                newDate.setFullYear(Number(val));
                setSelectedMonth(newDate);
              }}
            >
              <SelectTrigger className="h-9 border-zinc-200 bg-white">
                <SelectValue placeholder="Tahun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={fetchData} className="h-9 border-zinc-200">
            <RefreshCw className="mr-2 h-3.5 w-3.5 text-zinc-500" /> Refresh
          </Button>
        </div>
      </div>

      {}
      {restockArima.length > 0 && (
        <div className="flex items-start gap-4 p-4 rounded-xl border bg-zinc-50/50">
          <AlertCircle className="h-5 w-5 text-zinc-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-zinc-900">Pemberitahuan Restock ARIMA</h4>
            <p className="text-xs text-zinc-500 leading-relaxed mt-1">
              Model prediksi ARIMA mengidentifikasi <strong>{restockArima.length} produk</strong> memiliki stok di bawah estimasi permintaan mingguan berjalan.
              Disarankan melakukan restok suplai melalui menu <strong className="text-zinc-800">Transaksi Masuk</strong>.
            </p>
          </div>
        </div>
      )}

      {}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Katalog Produk</CardTitle>
            <Package className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900">{produk.length}</div>
            <p className="text-[11px] text-zinc-400 mt-1">Item aktif terdaftar</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Volume Masuk</CardTitle>
            <ArrowDown className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900">{totalMasuk.toLocaleString("id-ID")}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[11px] font-medium flex items-center ${trendMasuk >= 0 ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {trendMasuk >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                {trendMasuk >= 0 ? '+' : ''}{trendMasuk}% bulan lalu
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Volume Keluar</CardTitle>
            <ArrowUp className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900">{totalKeluar.toLocaleString("id-ID")}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[11px] font-medium flex items-center ${trendKeluar >= 0 ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {trendKeluar >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                {trendKeluar >= 0 ? '+' : ''}{trendKeluar}% bulan lalu
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aktivitas Transaksi</CardTitle>
            <Calendar className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-zinc-900">{transaksiBulan.length}</div>
            <p className="text-[11px] text-zinc-400 mt-1">Transaksi tercatat bulan ini</p>
          </CardContent>
        </Card>
      </div>

      {}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {}
        <Card className="lg:col-span-4 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Arus Stok Mingguan</CardTitle>
            <CardDescription className="text-xs">Statistik barang masuk dan keluar koperasi per periode W1 - W4</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="relative w-full">
              <Line
                data={lineChartData}
                redraw={true}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  aspectRatio: 2.2,
                  devicePixelRatio: window.devicePixelRatio,
                  plugins: {
                    legend: {
                      position: 'top',
                      align: 'end',
                      labels: {
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        font: { size: 11, weight: '500' }
                      }
                    },
                  },
                  scales: {
                    y: {
                      grid: { color: "rgba(0, 0, 0, 0.04)" },
                      ticks: { font: { size: 10 } },
                      border: { dash: [4, 4] }
                    },
                    x: {
                      grid: { display: false },
                      ticks: { font: { size: 10, weight: '500' } }
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {}
        <Card className="lg:col-span-3 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Transaksi Terbaru</CardTitle>
            <CardDescription className="text-xs">Daftar transaksi mutasi terakhir dalam bulan berjalan.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-xs text-zinc-400">
                Belum ada transaksi bulan ini
              </div>
            ) : (
              <div className="space-y-6">
                {recentTransactions.map((t) => {
                  const isMasuk = t.jenis_transaksi === "masuk";
                  const initial = t.nama_produk ? t.nama_produk.slice(0, 2).toUpperCase() : "PR";
                  return (
                    <div key={t.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold shrink-0 ${isMasuk ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-primary border-primary text-primary-foreground'}`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-900 truncate leading-none">{t.nama_produk}</p>
                          <p className="text-[10px] text-zinc-400 mt-1.5 leading-none">
                            {new Date(t.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-bold ${isMasuk ? 'text-zinc-900' : 'text-zinc-600'}`}>
                          {isMasuk ? "+" : "-"}{Number(t.jumlah)} unit
                        </p>
                        <p className="text-[9px] text-zinc-400 mt-1">
                          Rp {Number(t.total || (t.jumlah * t.harga)).toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {}
        <Card className="lg:col-span-3 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Stok Kritis</CardTitle>
            <CardDescription className="text-xs">Produk dengan stok di bawah batas minimal aman.</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] overflow-y-auto pr-1">
            {stokMinimum.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="h-8 w-8 text-zinc-300" />
                <p className="text-xs font-semibold text-zinc-700">Semua Stok Aman</p>
                <p className="text-[10px] text-zinc-400">Tidak ada produk kritis.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stokMinimum.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50/80 transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-zinc-900 truncate leading-none">{item.nama_produk}</p>
                      <p className="text-[10px] text-zinc-400 mt-1.5 leading-none">Batas aman: {item.stok_minimum} unit</p>
                    </div>
                    <span className="text-xs font-bold text-zinc-800 shrink-0 bg-white border px-2 py-1 rounded shadow-xs">
                      {item.stok} unit
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {}
        <Card className="lg:col-span-4 rounded-xl border border-zinc-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Ringkasan Operasional Stok</CardTitle>
            <CardDescription className="text-xs">Evaluasi rasio perputaran barang koperasi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 text-center pb-2">
              <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/20">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Turnover Stok Gudang</p>
                <p className="text-2xl font-black text-zinc-900 mt-1">{totalStok.toLocaleString("id-ID")} unit</p>
                <p className="text-[10px] text-zinc-400 mt-1">Stok fisik tersedia</p>
              </div>

              <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/20">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Rasio Stok Kritis</p>
                <p className={`text-2xl font-black mt-1 ${stokMinimum.length > 3 ? 'text-zinc-800' : 'text-zinc-900'}`}>
                  {produk.length > 0 ? ((stokMinimum.length / produk.length) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">{stokMinimum.length} produk di bawah batas aman</p>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl border border-zinc-100 bg-zinc-50/20 flex items-center justify-between">
              <div className="text-left">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Efisiensi Distribusi</p>
                <p className="text-[11px] text-zinc-500 mt-1">Rasio pengeluaran dibandingkan suplai masuk</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-zinc-900">
                  {totalMasuk > 0 ? ((totalKeluar / totalMasuk) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
