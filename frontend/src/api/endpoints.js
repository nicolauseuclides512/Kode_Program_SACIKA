export const ENDPOINTS = {

  login: "/login",


  produk: "/produk",


  kategori: "/kategori",


  laporan: "/laporan",
  dashboardSummary: "/dashboard/summary",


  transaksiMasuk: "/transaksi?jenis=masuk",
  transaksiKeluar: "/transaksi?jenis=keluar",

  inventoryHistory: (id) => `/inventory-history/${id}`,
  inventoryForecast: (id) => `/forecast/inventory/${id}`,
  latestInventoryForecast: (id) => `/forecast/inventory/${id}/latest`,
  salesForecastReadiness: (id) => `/forecast/sales/${id}/readiness`,
  inventoryRisk: "/forecast/inventory-risk",
  inventoryForecastBatch: "/forecast/inventory/batch",
  evaluateInventoryForecasts: "/forecast/inventory/evaluate-actuals",
};
