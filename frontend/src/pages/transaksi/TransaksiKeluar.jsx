import { useEffect, useState } from "react";
import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { SearchableSelect } from "../../components/ui/searchable-select";
import { DataTable } from "../../components/data-table";
import { Minus, Pencil, Trash2 } from "lucide-react";
import { Toast } from "../../components/ui/alert-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

const TransaksiKeluar = () => {
  const [produk, setProduk] = useState([]);
  const [data, setData] = useState([]);
  const [selectedProduk, setSelectedProduk] = useState(null);
  const [jumlah, setJumlah] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });
  const [error, setError] = useState(null);


  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);


  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);


  const [toast, setToast] = useState(null);

  const productOptions = produk.map((p) => ({
    value: p.id,
    label: p.nama_produk,
    sublabel: `Stok: ${p.stok} | Rp ${Number(p.harga).toLocaleString("id-ID")}`,
  }));

  useEffect(() => {
    fetchProduk();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchTransaksi(), 250);
    return () => clearTimeout(timer);
  }, [pagination.page, pagination.limit, search]);

  const fetchProduk = async () => {
    try {
      const res = await api.get(ENDPOINTS.produk, { params: { all: true, status: "active" } });
      setProduk(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransaksi = async () => {
    try {
      const res = await api.get("/transaksi", {
        params: {
          jenis: "keluar",
          page: pagination.page,
          limit: pagination.limit,
          search,
        },
      });
      setData(res.data.data);
      setPagination((current) => ({ ...current, ...res.data.pagination }));
    } catch (err) {
      console.error(err);
    }
  };

  const harga = selectedProduk ? Number(selectedProduk.harga) : 0;
  const stok = selectedProduk ? Number(selectedProduk.stok) : 0;
  const total = harga * (Number(jumlah) || 0);

  const resetForm = () => {
    setSelectedProduk(null);
    setJumlah("");
    setTanggal("");
    setEditId(null);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduk) {
      setError("Pilih produk terlebih dahulu");
      setToast({ message: "Silakan pilih produk terlebih dahulu!", type: "error" });
      return;
    }
    if (Number(jumlah) > stok) {
      setError("Stok tidak mencukupi!");
      setToast({ message: "Transaksi gagal: Stok produk tidak mencukupi!", type: "error" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/transaksi", {
        produk_id: selectedProduk.value,
        jumlah: Number(jumlah),
        harga: harga,
        tanggal: tanggal,
        jenis_transaksi: "keluar",
      });
      resetForm();
      setIsCreateOpen(false);
      await fetchTransaksi();
      await fetchProduk();
      setToast({ message: "Transaksi keluar berhasil dicatat!", type: "success" });
    } catch (err) {
      const msg = err.response?.data?.message || "Gagal transaksi keluar";
      setError(msg);
      setToast({ message: `Gagal mencatat transaksi: ${msg}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (item) => {
    setEditId(item.id);
    const prod = produk.find((p) => p.id === item.produk_id);

    const baseStok = prod ? Number(prod.stok) : 0;
    const virtualStok = baseStok + Number(item.jumlah);
    setSelectedProduk(prod ? { value: prod.id, harga: prod.harga, stok: virtualStok } : null);
    setJumlah(item.jumlah);
    setTanggal(item.tanggal ? new Date(item.tanggal).toISOString().split('T')[0] : "");
    setError(null);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedProduk) {
      setError("Pilih produk terlebih dahulu");
      setToast({ message: "Silakan pilih produk terlebih dahulu!", type: "error" });
      return;
    }
    if (Number(jumlah) > stok) {
      setError("Stok tidak mencukupi untuk pembaruan ini!");
      setToast({ message: "Gagal memperbarui: Stok produk tidak mencukupi!", type: "error" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.put(`/transaksi/${editId}`, {
        produk_id: selectedProduk.value,
        jumlah: Number(jumlah),
        harga: harga,
        tanggal: tanggal,
        jenis_transaksi: "keluar",
      });
      resetForm();
      setIsEditOpen(false);
      await fetchTransaksi();
      await fetchProduk();
      setToast({ message: "Transaksi keluar berhasil diperbarui!", type: "success" });
    } catch (err) {
      const msg = err.response?.data?.message || "Gagal memperbarui transaksi";
      setError(msg);
      setToast({ message: `Gagal memperbarui: ${msg}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setLoading(true);
    try {
      await api.delete(`/transaksi/${deleteId}`);
      setIsDeleteOpen(false);
      setDeleteId(null);
      await fetchTransaksi();
      await fetchProduk();
      setToast({ message: "Transaksi keluar berhasil dihapus dan stok disesuaikan!", type: "success" });
    } catch {
      setToast({ message: "Gagal menghapus transaksi keluar.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Transaksi Keluar</h2>
          <p className="text-sm text-muted-foreground">
            Catat dan pantau transaksi penjualan atau pengeluaran stok barang koperasi.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} variant="destructive" className="shadow-sm">
          <Minus className="mr-2 h-4 w-4" /> Catat Transaksi Keluar
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <DataTable
            columns={[
              { key: "no", label: "No", width: "70px", render: (_, idx) => idx + 1 },
              { key: "nama_produk", label: "Produk" },
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
              {
                key: "tanggal",
                label: "Tanggal",
                render: (row) => new Date(row.tanggal).toLocaleDateString("id-ID"),
              },
              {
                key: "aksi",
                label: "Aksi",
                width: "120px",
                render: (row) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEditClick(row)}>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button size="sm" variant="destructive" className="h-8 w-8 p-0 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20" onClick={() => handleDeleteClick(row.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ),
              },
            ]}
            data={data}
            searchPlaceholder="Cari riwayat transaksi..."
            searchableFields={["nama_produk"]}
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
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Catat Transaksi Keluar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Produk</label>
                <SearchableSelect
                  options={productOptions}
                  value={selectedProduk?.value ? String(selectedProduk.value) : ""}
                  onValueChange={(value) => {
                    const selected = produk.find((p) => p.id === Number(value));
                    setSelectedProduk(selected ? { value: selected.id, harga: selected.harga, stok: selected.stok } : null);
                  }}
                  placeholder="Pilih produk..."
                  searchPlaceholder="Cari produk..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Jumlah</label>
                  <Input
                    type="number"
                    placeholder="Masukkan jumlah"
                    value={jumlah}
                    onChange={(e) => setJumlah(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Stok Tersedia</label>
                  <Input value={selectedProduk ? stok : 0} disabled className="bg-slate-50 border border-slate-100 font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Harga Satuan</label>
                  <Input value={harga ? `Rp ${Number(harga).toLocaleString("id-ID")}` : "Rp 0"} disabled className="bg-slate-50 border border-slate-100" />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Total Harga</label>
                  <Input value={total ? `Rp ${Number(total).toLocaleString("id-ID")}` : "Rp 0"} disabled className="bg-slate-50 border border-slate-100 font-semibold" />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Tanggal</label>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? "Memproses..." : "Simpan Transaksi"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Ubah Transaksi Keluar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Produk</label>
                <SearchableSelect
                  options={productOptions}
                  value={selectedProduk?.value ? String(selectedProduk.value) : ""}
                  onValueChange={(value) => {
                    const selected = produk.find((p) => p.id === Number(value));
                    setSelectedProduk(selected ? { value: selected.id, harga: selected.harga, stok: selected.stok } : null);
                  }}
                  placeholder="Pilih produk..."
                  searchPlaceholder="Cari produk..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Jumlah</label>
                  <Input
                    type="number"
                    placeholder="Masukkan jumlah"
                    value={jumlah}
                    onChange={(e) => setJumlah(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Stok Maksimal</label>
                  <Input value={selectedProduk ? stok : 0} disabled className="bg-slate-50 border border-slate-100 font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Harga Satuan</label>
                  <Input value={harga ? `Rp ${Number(harga).toLocaleString("id-ID")}` : "Rp 0"} disabled className="bg-slate-50 border border-slate-100" />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Total Harga</label>
                  <Input value={total ? `Rp ${Number(total).toLocaleString("id-ID")}` : "Rp 0"} disabled className="bg-slate-50 border border-slate-100 font-semibold" />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Tanggal</label>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? "Memproses..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Hapus Transaksi Keluar?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-zinc-500">
            Apakah Anda yakin ingin menghapus transaksi keluar ini? Tindakan ini akan secara otomatis mengembalikan jumlah stok produk ke sistem koperasi.
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={loading}>
              {loading ? "Menghapus..." : "Hapus Transaksi"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

export default TransaksiKeluar;
