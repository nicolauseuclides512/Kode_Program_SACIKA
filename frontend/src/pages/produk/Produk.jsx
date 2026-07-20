import { useEffect, useState } from "react";

import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DataTable } from "../../components/data-table";
import { Pencil, Trash2, Plus, Info } from "lucide-react";
import { Toast } from "../../components/ui/alert-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";

const Produk = () => {
  const [data, setData] = useState([]);
  const [kategori, setKategori] = useState([]);
  
  const [loading, setLoading] = useState(false);
  
  
  const [nama, setNama] = useState("");
  const [harga, setHarga] = useState("");
  const [stokMinimum, setStokMinimum] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [activeFrom, setActiveFrom] = useState("");
  const [activeUntil, setActiveUntil] = useState("");
  const [editId, setEditId] = useState(null);

  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchData();
    fetchKategori();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get(ENDPOINTS.produk);
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchKategori = async () => {
    try {
      const res = await api.get(ENDPOINTS.kategori);
      setKategori(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(ENDPOINTS.produk, {
        nama_produk: nama,
        harga,
        stok_minimum: stokMinimum,
        kategori_id: kategoriId,
        is_active: isActive,
        active_from: activeFrom || null,
        active_until: activeUntil || null,
      });
      resetForm();
      setIsCreateOpen(false);
      fetchData();
      setToast({ message: "Produk baru berhasil ditambahkan!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal menambahkan produk baru.";
      setToast({ message: errMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (item) => {
    setEditId(item.id);
    setNama(item.nama_produk);
    setHarga(item.harga);
    setStokMinimum(item.stok_minimum);
    setKategoriId(String(item.kategori_id));
    setIsActive(item.is_active !== false);
    setActiveFrom(item.active_from ? String(item.active_from).slice(0, 7) : "");
    setActiveUntil(item.active_until ? String(item.active_until).slice(0, 7) : "");
    setIsEditOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`${ENDPOINTS.produk}/${editId}`, {
        nama_produk: nama,
        harga,
        stok_minimum: stokMinimum,
        kategori_id: kategoriId,
        is_active: isActive,
        active_from: activeFrom || null,
        active_until: activeUntil || null,
      });
      resetForm();
      setIsEditOpen(false);
      fetchData();
      setToast({ message: "Data produk berhasil diperbarui!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal memperbarui data produk.";
      setToast({ message: errMsg, type: "error" });
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
      await api.delete(`${ENDPOINTS.produk}/${deleteId}`);
      setIsDeleteOpen(false);
      setDeleteId(null);
      fetchData();
      setToast({ message: "Produk berhasil dihapus!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal menghapus produk.";
      setToast({ message: errMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setNama("");
    setHarga("");
    setStokMinimum("");
    setKategoriId("");
    setIsActive(true);
    setActiveFrom("");
    setActiveUntil("");
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Kelola Master Produk</h2>
          <p className="text-sm text-muted-foreground">
            Kelola data produk sacika, atur harga, dan pantau batas minimal stok.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Tambah Produk
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <DataTable
            columns={[
              { key: "no", label: "No", width: "70px", render: (_, idx) => idx + 1 },
              { key: "nama_produk", label: "Nama Produk" },
              { key: "nama_kategori", label: "Kategori" },
              {
                key: "harga",
                label: "Harga",
                render: (row) => `Rp ${Number(row.harga).toLocaleString("id-ID")}`,
              },
              { key: "stok_minimum", label: "Stok Minimum" },
              {
                key: "is_active",
                label: "Status",
                render: (row) => row.is_active ? "Aktif" : "Tidak Aktif",
              },
              {
                key: "periode_aktif",
                label: "Periode Aktif",
                render: (row) => {
                  const start = row.active_from ? String(row.active_from).slice(0, 7) : "-";
                  const end = row.active_until ? String(row.active_until).slice(0, 7) : "sekarang";
                  return `${start} s.d. ${end}`;
                },
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
            searchPlaceholder="Cari produk berdasarkan nama atau kategori..."
            searchableFields={["nama_produk", "nama_kategori"]}
            pageSize={10}
          />
        </CardContent>
      </Card>

      {}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Tambah Produk Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Nama Produk</label>
                <Input
                  placeholder="Masukkan nama produk"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Harga Jual (Rp)</label>
                  <Input
                    type="number"
                    placeholder="Contoh: 15000"
                    value={harga}
                    onChange={(e) => setHarga(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Stok Minimum</label>
                  <Input
                    type="number"
                    placeholder="Contoh: 10"
                    value={stokMinimum}
                    onChange={(e) => setStokMinimum(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Kategori</label>
                <Select value={kategoriId} onValueChange={setKategoriId} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih kategori produk" />
                  </SelectTrigger>
                  <SelectContent>
                    {kategori.map((k) => (
                      <SelectItem key={k.id} value={String(k.id)}>
                        {k.nama_kategori}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Aktif Sejak</label>
                  <Input
                    type="month"
                    value={activeFrom}
                    onChange={(e) => setActiveFrom(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Aktif Sampai</label>
                  <Input
                    type="month"
                    value={activeUntil}
                    min={activeFrom || undefined}
                    onChange={(e) => setActiveUntil(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Produk aktif
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Memproses..." : "Tambah Produk"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Produk</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Nama Produk</label>
                <Input
                  placeholder="Masukkan nama produk"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Harga Jual (Rp)</label>
                  <Input
                    type="number"
                    placeholder="Contoh: 15000"
                    value={harga}
                    onChange={(e) => setHarga(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Stok Minimum</label>
                  <Input
                    type="number"
                    placeholder="Contoh: 10"
                    value={stokMinimum}
                    onChange={(e) => setStokMinimum(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Kategori</label>
                <Select value={String(kategoriId)} onValueChange={setKategoriId} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih kategori produk" />
                  </SelectTrigger>
                  <SelectContent>
                    {kategori.map((k) => (
                      <SelectItem key={k.id} value={String(k.id)}>
                        {k.nama_kategori}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Aktif Sejak</label>
                  <Input
                    type="month"
                    value={activeFrom}
                    onChange={(e) => setActiveFrom(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none">Aktif Sampai</label>
                  <Input
                    type="month"
                    value={activeUntil}
                    min={activeFrom || undefined}
                    onChange={(e) => setActiveUntil(e.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Produk aktif
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Memproses..." : "Simpan Perubahan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Apakah Anda yakin?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground pt-1">
              Tindakan ini tidak dapat dibatalkan. Produk akan dihapus secara permanen dari basis data dan data transaksi terkait mungkin terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3">
            <AlertDialogCancel disabled={loading} onClick={() => { setIsDeleteOpen(false); setDeleteId(null); }}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {loading ? "Menghapus..." : "Hapus Produk"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

export default Produk;
