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
  salesHistory: (id) => `/forecast/sales/${id}/history`,
  salesForecastReadiness: (id) => `/forecast/sales/${id}/readiness`,
  salesForecastPreview: (id) => `/forecast/sales/${id}/preview`,
  inventoryRisk: "/forecast/inventory-risk",
  inventoryForecastBatch: "/forecast/inventory/batch",
  evaluateInventoryForecasts: "/forecast/inventory/evaluate-actuals",
};
