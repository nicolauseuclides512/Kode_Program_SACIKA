export const ENDPOINTS = {
  
  login: "/login",

  
  produk: "/produk",

  
  kategori: "/kategori",

  
  laporan: "/laporan",

  
  transaksiMasuk: "/transaksi?jenis=masuk",
  transaksiKeluar: "/transaksi?jenis=keluar",

  inventoryHistory: (id) => `/inventory-history/${id}`,
  inventoryForecast: (id) => `/forecast/inventory/${id}`,
  latestInventoryForecast: (id) => `/forecast/inventory/${id}/latest`,
  inventoryRisk: "/forecast/inventory-risk",
};
