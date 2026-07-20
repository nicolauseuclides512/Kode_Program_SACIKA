import { useEffect, useState } from "react";

import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DataTable } from "../../components/data-table";
import { FileDown, FileSpreadsheet, Filter } from "lucide-react";
import { Toast } from "../../components/ui/alert-toast";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const Report = () => {

  const getFirstDayOfMonth = () => {
    const date = new Date();
    const y = date.getFullYear();
    const m = date.getMonth();
    return new Date(y, m, 1).toISOString().split("T")[0];
  };

  const getToday = () => {
    return new Date().toISOString().split("T")[0];
  };

  const [data, setData] = useState([]);
  const [kategori, setKategori] = useState([]);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });


  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [jenisTransaksi, setJenisTransaksi] = useState("semua");
  const [kategoriId, setKategoriId] = useState("semua");


  const [summary, setSummary] = useState({
    totalMasuk: 0,
    totalKeluar: 0,
    nominalMasuk: 0,
    nominalKeluar: 0,
  });


  const [toast, setToast] = useState(null);

  async function fetchReport() {
    try {
      const params = { page: pagination.page, limit: pagination.limit, search };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (jenisTransaksi && jenisTransaksi !== "semua") params.jenis_transaksi = jenisTransaksi;
      if (kategoriId && kategoriId !== "semua") params.kategori_id = kategoriId;

      const res = await api.get(ENDPOINTS.laporan, { params });
      setData(res.data.data);
      setPagination((current) => ({ ...current, ...res.data.pagination }));
      setSummary({
        totalMasuk: Number(res.data.summary.incoming_quantity || 0),
        totalKeluar: Number(res.data.summary.outgoing_quantity || 0),
        nominalMasuk: Number(res.data.summary.incoming_value || 0),
        nominalKeluar: Number(res.data.summary.outgoing_value || 0),
      });
    } catch (err) {
      console.error(err);
      setToast({ message: "Gagal mengambil data laporan.", type: "error" });
    }
  }

  useEffect(() => {
    let active = true;
    api.get(ENDPOINTS.kategori)
      .then((res) => {
        if (active) setKategori(res.data);
      })
      .catch((error) => console.error(error));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchReport(), 250);
    return () => clearTimeout(timer);
  }, [pagination.page, pagination.limit, search]);


  const handleFilter = (e) => {
    e.preventDefault();
    setPagination((current) => ({ ...current, page: 1 }));
    fetchReport();
  };

  const handleExportPDF = () => {
    if (data.length === 0) {
      setToast({ message: "Tidak ada data untuk diekspor.", type: "error" });
      return;
    }

    const doc = new jsPDF();


    doc.setFontSize(16);
    doc.setTextColor(24, 24, 27);
    doc.text("Laporan Transaksi Koperasi Sacika", 14, 20);


    doc.setFontSize(10);
    doc.setTextColor(113, 113, 122);
    doc.text(`Periode: ${startDate || "-"} s/d ${endDate || "-"}`, 14, 27);
    doc.text(`Jenis Transaksi: ${jenisTransaksi === "semua" ? "Semua" : jenisTransaksi === "masuk" ? "Transaksi Masuk" : "Transaksi Keluar"}`, 14, 33);

    let labelKategori = "Semua";
    if (kategoriId !== "semua") {
      const selectedKat = kategori.find(k => String(k.id) === String(kategoriId));
      if (selectedKat) labelKategori = selectedKat.nama_kategori;
    }
    doc.text(`Kategori Produk: ${labelKategori}`, 14, 39);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleString("id-ID")}`, 14, 45);


    const tableColumn = ["No", "Tanggal", "Nama Produk", "Kategori", "Tipe", "Jumlah", "Harga", "Total"];


    const tableRows = data.map((item, idx) => [
      idx + 1,
      item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID") : "-",
      item.nama_produk,
      item.nama_kategori || "Lain-lain",
      item.jenis_transaksi === "masuk" ? "Masuk" : "Keluar",
      item.jumlah,
      `Rp ${Number(item.harga).toLocaleString("id-ID")}`,
      `Rp ${Number(item.total).toLocaleString("id-ID")}`
    ]);


    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      theme: "striped",
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 8, font: "helvetica" },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 22 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 }
      }
    });


    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    doc.text(`Total Qty Masuk: ${summary.totalMasuk} unit`, 14, finalY);
    doc.text(`Total Nominal Masuk: Rp ${summary.nominalMasuk.toLocaleString("id-ID")}`, 14, finalY + 6);
    doc.text(`Total Qty Keluar: ${summary.totalKeluar} unit`, 100, finalY);
    doc.text(`Total Nominal Keluar: Rp ${summary.nominalKeluar.toLocaleString("id-ID")}`, 100, finalY + 6);
    doc.text(`Selisih Kas/Net Flow: Rp ${(summary.nominalMasuk - summary.nominalKeluar).toLocaleString("id-ID")}`, 14, finalY + 16);

    doc.save(`Laporan_Transaksi_${startDate}_sd_${endDate}.pdf`);
  };

  const handleExportExcel = () => {
    if (data.length === 0) {
      setToast({ message: "Tidak ada data untuk diekspor.", type: "error" });
      return;
    }

    const formattedData = data.map((item, idx) => ({
      No: idx + 1,
      Tanggal: item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID") : "-",
      "Nama Produk": item.nama_produk,
      Kategori: item.nama_kategori || "Lain-lain",
      Tipe: item.jenis_transaksi === "masuk" ? "Masuk" : "Keluar",
      Jumlah: Number(item.jumlah),
      Harga: Number(item.harga),
      Total: Number(item.total)
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Transaksi");


    const summaryData = [
      [],
      ["Ringkasan Laporan"],
      ["Total Qty Masuk", summary.totalMasuk],
      ["Total Nominal Masuk", summary.nominalMasuk],
      ["Total Qty Keluar", summary.totalKeluar],
      ["Total Nominal Keluar", summary.nominalKeluar],
      ["Net Flow", summary.nominalMasuk - summary.nominalKeluar]
    ];
    XLSX.utils.sheet_add_aoa(worksheet, summaryData, { origin: -1 });


    const max_len = formattedData.reduce((prev, next) => {
      Object.keys(next).forEach((key) => {
        const val = next[key] ? next[key].toString() : "";
        prev[key] = Math.max(prev[key] || 0, val.length, key.length);
      });
      return prev;
    }, {});

    const colWidths = Object.keys(max_len).map((key) => ({
      wch: max_len[key] + 3
    }));
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `Laporan_Transaksi_${startDate}_sd_${endDate}.xlsx`);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Laporan Transaksi</h2>
          <p className="text-sm text-muted-foreground">
            Pantau dan ekspor laporan transaksi masuk dan keluar koperasi.
          </p>
        </div>
      </div>

      {}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <form onSubmit={handleFilter} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mulai Tanggal</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Sampai Tanggal</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Jenis Transaksi</label>
              <Select value={jenisTransaksi} onValueChange={setJenisTransaksi}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Jenis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Transaksi</SelectItem>
                  <SelectItem value="masuk">Transaksi Masuk</SelectItem>
                  <SelectItem value="keluar">Transaksi Keluar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kategori Produk</label>
              <Select value={String(kategoriId)} onValueChange={setKategoriId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Kategori</SelectItem>
                  {kategori.map((k) => (
                    <SelectItem key={k.id} value={String(k.id)}>
                      {k.nama_kategori}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full h-9 shadow-sm">
              <Filter className="mr-2 h-4 w-4" /> Terapkan Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      {}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-xs border border-zinc-100 bg-white">
          <CardContent className="p-5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Transaksi Masuk</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-zinc-950">
                Rp {summary.nominalMasuk.toLocaleString("id-ID")}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500 mt-2 font-medium">
              Qty: {summary.totalMasuk} unit produk
            </span>
          </CardContent>
        </Card>

        <Card className="shadow-xs border border-zinc-100 bg-white">
          <CardContent className="p-5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Transaksi Keluar</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-extrabold text-zinc-950">
                Rp {summary.nominalKeluar.toLocaleString("id-ID")}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500 mt-2 font-medium">
              Qty: {summary.totalKeluar} unit produk
            </span>
          </CardContent>
        </Card>

        <Card className="shadow-xs border border-zinc-100 bg-white">
          <CardContent className="p-5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Selisih Kas / Net Flow</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`text-2xl font-extrabold ${(summary.nominalMasuk - summary.nominalKeluar) >= 0 ? "text-green-600" : "text-red-600"}`}>
                Rp {(summary.nominalMasuk - summary.nominalKeluar).toLocaleString("id-ID")}
              </span>
            </div>
            <span className="text-[11px] text-zinc-500 mt-2 font-medium">
              Arus keuangan bersih periode terpilih
            </span>
          </CardContent>
        </Card>
      </div>

      {}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h3 className="text-sm font-bold text-zinc-900 select-none">Rincian Transaksi</h3>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleExportExcel} className="h-8 text-xs">
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-green-600" /> Export Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExportPDF} className="h-8 text-xs">
                <FileDown className="mr-1.5 h-3.5 w-3.5 text-red-600" /> Export PDF
              </Button>
            </div>
          </div>

          <DataTable
            columns={[
              { key: "no", label: "No", width: "70px", render: (_, idx) => idx + 1 },
              {
                key: "tanggal",
                label: "Tanggal",
                render: (row) => row.tanggal ? new Date(row.tanggal).toLocaleDateString("id-ID") : "-",
              },
              { key: "nama_produk", label: "Nama Produk" },
              { key: "nama_kategori", label: "Kategori", render: (row) => row.nama_kategori || "Lain-lain" },
              {
                key: "jenis_transaksi",
                label: "Tipe",
                render: (row) => (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    row.jenis_transaksi === "masuk"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {row.jenis_transaksi === "masuk" ? "Masuk" : "Keluar"}
                  </span>
                ),
              },
              { key: "jumlah", label: "Jumlah" },
              {
                key: "harga",
                label: "Harga",
                render: (row) => `Rp ${Number(row.harga).toLocaleString("id-ID")}`,
              },
              {
                key: "total",
                label: "Total",
                render: (row) => `Rp ${Number(row.total).toLocaleString("id-ID")}`,
              },
            ]}
            data={data}
            searchPlaceholder="Cari transaksi berdasarkan produk atau kategori..."
            searchableFields={["nama_produk", "nama_kategori"]}
            pageSize={10}
            serverPagination={pagination}
            searchTerm={search}
            onSearchChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 1 })); }}
            onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
            onPageSizeChange={(limit) => setPagination((current) => ({ ...current, page: 1, limit }))}
          />
        </CardContent>
      </Card>

      {}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Report;
