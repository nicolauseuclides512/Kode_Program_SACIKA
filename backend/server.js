require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const kategoriRoutes = require("./routes/kategoriRoutes");
const produkRoutes = require("./routes/produkRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");
const datasetRoutes = require("./routes/datasetRoutes");
const laporanRoutes = require("./routes/laporanRoutes");
const inventoryHistoryRoutes = require("./routes/inventoryHistoryRoutes");
const forecastRoutes = require("./routes/forecastRoutes");

function validateRuntimeEnvironment() {
  const requiredVariables = ["DATABASE_URL", "JWT_SECRET"];
  const missing = requiredVariables.filter(
    (variableName) => !process.env[variableName]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Environment backend belum lengkap: ${missing.join(", ")}`,
    );
  }

  if (process.env.JWT_SECRET.trim().length < 32) {
    throw new Error("JWT_SECRET minimal 32 karakter.");
  }
}

function getAllowedOrigins() {
  const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length
    ? configuredOrigins
    : [
        "https://sacika-frontend-5f263ed65a83.herokuapp.com",
        "http://localhost:5173",
        "https://koperasisacika.my.id",
      ];
}

function createApp() {
  const app = express();
  const allowedOrigins = new Set(getAllowedOrigins());

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Origin tidak diizinkan oleh CORS"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", authRoutes);
  app.use("/api/kategori", kategoriRoutes);
  app.use("/api/produk", produkRoutes);
  app.use("/api/transaksi", transaksiRoutes);
  app.use("/api/dataset", datasetRoutes);
  app.use("/api/laporan", laporanRoutes);
  app.use("/api/inventory-history", inventoryHistoryRoutes);
  app.use("/api/forecast", forecastRoutes);

  app.get("/", (req, res) => {
    res.send("API Sistem Koperasi SACIKA");
  });

  return app;
}

if (require.main === module) {
  try {
    validateRuntimeEnvironment();
    const app = createApp();
    const port = process.env.PORT || 3001;

    app.listen(port, () => {
      console.log(`Server berjalan di port ${port}`);
    });
  } catch (error) {
    console.error("Backend tidak dapat dijalankan:", error.message);
    process.exit(1);
  }
}

module.exports = {
  createApp,
  getAllowedOrigins,
  validateRuntimeEnvironment,
};
