require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const kategoriRoutes = require("./routes/kategoriRoutes");
const produkRoutes = require("./routes/produkRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");
const prediksiRoutes = require("./routes/prediksiRoutes");
const datasetRoutes = require("./routes/datasetRoutes");
const laporanRoutes = require("./routes/laporanRoutes");
const inventoryHistoryRoutes = require("./routes/inventoryHistoryRoutes");
const forecastRoutes = require("./routes/forecastRoutes");

const app = express();

app.use(cors({
  origin: ['https://sacika-frontend-5f263ed65a83.herokuapp.com', 'http://localhost:5173', 'https://koperasisacika.my.id'],
  credentials: true
}));
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api/kategori", kategoriRoutes);
app.use("/api/produk", produkRoutes);
app.use("/api/transaksi", transaksiRoutes);
app.use("/api/prediksi", prediksiRoutes);
app.use("/api/dataset", datasetRoutes);
app.use("/api/laporan", laporanRoutes);
app.use("/api/inventory-history", inventoryHistoryRoutes);
app.use("/api/forecast", forecastRoutes);

app.get("/", (req, res) => {
  res.send("API Sistem Koperasi ARIMA");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
