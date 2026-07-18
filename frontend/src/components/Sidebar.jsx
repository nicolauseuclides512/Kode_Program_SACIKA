import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";

const Sidebar = () => {
  const menu = [
    {
      group: "MAIN MENU",
      items: [
        {
          name: "Dashboard",
          path: "/dashboard",
          icon: LayoutDashboard,
        },
      ],
    },

    {
      group: "MASTER DATA",
      items: [
        {
          name: "Produk",
          path: "/produk",
          icon: Package,
        },
      ],
    },

    {
      group: "TRANSAKSI",
      items: [
        {
          name: "Transaksi Masuk",
          path: "/transaksi/masuk",
          icon: ArrowDownToLine,
        },

        {
          name: "Transaksi Keluar",
          path: "/transaksi/keluar",
          icon: ArrowUpFromLine,
        },
      ],
    },

    {
      group: "PREDIKSI",
      items: [
        {
          name: "Prediksi Penjualan",
          path: "/prediksi",
          icon: TrendingUp,
        },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {}
      <div className="p-6 border-b">
        <h4 className="text-lg font-bold">Koperasi Sacika</h4>
        <p className="text-xs text-muted-foreground mt-1">Sistem Informasi Koperasi</p>
      </div>

      {}
      <div className="flex-1 p-4 overflow-y-auto">
        {menu.map((section, i) => (
          <div key={i} className="mb-6">
            {}
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
              {section.group}
            </div>

            {}
            {section.items.map((item, index) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={index}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 mb-1 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
