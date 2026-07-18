export const ENDPOINTS = {
  
  login: "/login",

  
  produk: "/produk",

  
  kategori: "/kategori",

  
  laporan: "/laporan",

  
  transaksiMasuk: "/transaksi?jenis=masuk",
  transaksiKeluar: "/transaksi?jenis=keluar",

  
  prediksiDataset: (id, start = "", end = "") => {
    let url = `/prediksi/dataset/${id}`;
    if (start && end) {
      url += `?start=${start}&end=${end}`;
    }
    return url;
  },

  
  prediksi: (id, minggu = 1, start = "", end = "") => {
    let url = `/prediksi/${id}?minggu=${minggu}`;
    if (start && end) {
      url += `&start=${start}&end=${end}`;
    }
    return url;
  },

  
  prediksiChart: (id, minggu = 1, start = "", end = "") => {
    let url = `/prediksi/chart/${id}?minggu=${minggu}`;
    if (start && end) {
      url += `&start=${start}&end=${end}`;
    }
    return url;
  },

  inventoryHistory: (id) => `/inventory-history/${id}`,
  inventoryForecast: (id) => `/forecast/inventory/${id}`,
  latestInventoryForecast: (id) => `/forecast/inventory/${id}/latest`,
};
