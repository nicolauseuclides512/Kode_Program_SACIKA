import * as React from "react"
import { useContext } from "react"
import { NavLink } from "react-router-dom"
import AuthContext from "../auth/AuthContext"
import { 
  LayoutDashboard, 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  TrendingUp,
  MoreVertical,
  LogOut,
  Folder,
  FileText
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"

const data = {
  navMain: [
    {
      title: "Menu Utama",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Produk",
          url: "/produk",
          icon: Package,
        },
        {
          title: "Kategori",
          url: "/kategori",
          icon: Folder,
        },
      ],
    },
    {
      title: "Transaksi",
      items: [
        {
          title: "Transaksi Masuk",
          url: "/transaksi/masuk",
          icon: ArrowDownToLine,
        },
        {
          title: "Transaksi Keluar",
          url: "/transaksi/keluar",
          icon: ArrowUpFromLine,
        },
        {
          title: "Laporan",
          url: "/laporan",
          icon: FileText,
        },
      ],
    },
    {
      title: "Forecasting",
      items: [
        {
          title: "Prediksi Persediaan",
          url: "/prediksi",
          icon: TrendingUp,
        },
      ],
    },
  ]
}

export function AppSidebar({ ...props }) {
  const { logout } = useContext(AuthContext);
  const username = localStorage.getItem("username") || "admin";

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex flex-col h-full bg-primary border-r border-red-700 select-none text-white" {...props}>
      {}
      <div className="px-6 py-6 flex items-center gap-2.5">
        <div className="h-6 w-6 rounded-full bg-white flex items-center justify-center text-primary font-black text-xs">
          S
        </div>
        <span className="font-semibold text-sm tracking-tight text-white">Sacika Koperasi</span>
      </div>

      {}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-5">
        {data.navMain.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <span className="text-[10px] font-bold text-red-200/60 uppercase tracking-wider px-3">
              {section.title}
            </span>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-white text-primary shadow-sm"
                          : "text-red-100 hover:text-white hover:bg-white/10"
                      }`
                    }
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item.title}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {}
      <div className="p-4 border-t border-red-700/60 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-full border border-white/10 bg-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0 uppercase">
            {username.slice(0, 2)}
          </div>
          <div className="min-w-0 leading-none">
            <p className="text-xs font-bold text-white truncate capitalize leading-tight">{username}</p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 hover:bg-white/10 rounded text-red-100 hover:text-white transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 border border-zinc-200 shadow-md">
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/5 cursor-pointer">
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
