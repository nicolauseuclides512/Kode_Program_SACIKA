import { useEffect, useState } from "react";

import api from "../../api/axios";
import { ENDPOINTS } from "../../api/endpoints";

import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DataTable } from "../../components/data-table";
import { Pencil, Trash2, Plus } from "lucide-react";
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

const Kategori = () => {
  const [data, setData] = useState([]);
  
  const [loading, setLoading] = useState(false);
  
  
  const [namaKategori, setNamaKategori] = useState("");
  const [editId, setEditId] = useState(null);

  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get(ENDPOINTS.kategori);
      setData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(ENDPOINTS.kategori, {
        nama_kategori: namaKategori,
      });
      resetForm();
      setIsCreateOpen(false);
      fetchData();
      setToast({ message: "Kategori baru berhasil ditambahkan!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal menambahkan kategori baru.";
      setToast({ message: errMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (item) => {
    setEditId(item.id);
    setNamaKategori(item.nama_kategori);
    setIsEditOpen(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`${ENDPOINTS.kategori}/${editId}`, {
        nama_kategori: namaKategori,
      });
      resetForm();
      setIsEditOpen(false);
      fetchData();
      setToast({ message: "Kategori berhasil diperbarui!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal memperbarui kategori.";
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
      await api.delete(`${ENDPOINTS.kategori}/${deleteId}`);
      setIsDeleteOpen(false);
      setDeleteId(null);
      fetchData();
      setToast({ message: "Kategori berhasil dihapus!", type: "success" });
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Gagal menghapus kategori.";
      setToast({ message: errMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setNamaKategori("");
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Kelola Kategori Produk</h2>
          <p className="text-sm text-muted-foreground">
            Kelola data kategori produk untuk pengelompokan produk koperasi.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Tambah Kategori
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <DataTable
            columns={[
              { key: "no", label: "No", width: "70px", render: (_, idx) => idx + 1 },
              { key: "nama_kategori", label: "Nama Kategori" },
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
            searchPlaceholder="Cari kategori..."
            searchableFields={["nama_kategori"]}
            pageSize={10}
          />
        </CardContent>
      </Card>

      {}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Tambah Kategori Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Nama Kategori</label>
                <Input
                  placeholder="Masukkan nama kategori"
                  value={namaKategori}
                  onChange={(e) => setNamaKategori(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Memproses..." : "Tambah Kategori"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Kategori</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-5 pt-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none">Nama Kategori</label>
                <Input
                  placeholder="Masukkan nama kategori"
                  value={namaKategori}
                  onChange={(e) => setNamaKategori(e.target.value)}
                  required
                />
              </div>
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
              Tindakan ini tidak dapat dibatalkan. Kategori akan dihapus secara permanen dari basis data dan data produk terkait mungkin terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3">
            <AlertDialogCancel disabled={loading} onClick={() => { setIsDeleteOpen(false); setDeleteId(null); }}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={loading} onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {loading ? "Menghapus..." : "Hapus Kategori"}
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

export default Kategori;
