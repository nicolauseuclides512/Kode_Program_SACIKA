import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AppSidebar } from "../components/app-sidebar";
import { Columns, Menu, X } from "lucide-react";

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getPageTitle = (pathname) => {
    if (pathname.startsWith("/produk")) return "Master Produk";
    if (pathname.startsWith("/kategori")) return "Kelola Kategori";
    if (pathname.startsWith("/transaksi/masuk")) return "Transaksi Masuk";
    if (pathname.startsWith("/transaksi/keluar")) return "Transaksi Keluar";
    if (pathname.startsWith("/prediksi")) return "Prediksi Persediaan";
    if (pathname.startsWith("/laporan")) return "Laporan Transaksi";
    return "Dashboard";
  };

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="flex min-h-screen bg-zinc-50/50 font-sans antialiased text-zinc-950">
      {/* Sidebar untuk Desktop (selalu tampil) dan Mobile (drawer overlay) */}
      <div 
        className={`w-64 border-r border-zinc-200 bg-white fixed h-full left-0 top-0 z-50 transition-transform duration-300 transform 
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          md:translate-x-0`}
      >
        <AppSidebar />
      </div>

      {/* Backdrop hitam transparan ketika sidebar mobile terbuka */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen w-full overflow-x-hidden">
        {/* Header */}
        <div className="sticky top-0 z-40 border-b border-red-700 bg-primary flex items-center justify-between px-4 md:px-8 py-3.5 select-none">
          <div className="flex items-center">
            {/* Tombol hamburger menu di layar HP */}
            <button 
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="h-8 w-8 hover:bg-white/10 border border-white/20 bg-white/5 rounded-lg flex items-center justify-center text-white transition-colors shadow-xs"
            >
              {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="h-4 w-px bg-white/20 mx-3.5" />
            <span className="text-sm font-semibold text-white tracking-tight">{pageTitle}</span>
          </div>
        </div>

        {/* Content Container dengan padding yang fleksibel (kecil di HP, lebar di Laptop) */}
        <div className="p-4 md:p-8 flex-1 flex flex-col w-full overflow-x-hidden">
          <div className="flex-1 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
