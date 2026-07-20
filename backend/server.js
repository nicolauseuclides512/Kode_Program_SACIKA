require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const {
  getCorsAllowedOrigins,
  validateRuntimeEnvironment,
} = require("./config/security");
const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");
const {
  requestIdMiddleware,
  requestLogger,
} = require("./middleware/requestContext");

const authRoutes = require("./routes/authRoutes");
const kategoriRoutes = require("./routes/kategoriRoutes");
const produkRoutes = require("./routes/produkRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");
const datasetRoutes = require("./routes/datasetRoutes");
const salesAggregationRoutes = require("./routes/salesAggregationRoutes");
const laporanRoutes = require("./routes/laporanRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const inventoryHistoryRoutes = require("./routes/inventoryHistoryRoutes");
const forecastRoutes = require("./routes/forecastRoutes");
const salesForecastRoutes = require("./routes/salesForecastRoutes");


function getAllowedOrigins() {
  return getCorsAllowedOrigins();
}

function buildCorsOptions(allowedOrigins = getAllowedOrigins()) {
  const originSet = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      // Request tanpa Origin berasal dari server, CLI, health checker, atau aplikasi native.
      if (!origin || originSet.has(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origin tidak diizinkan oleh CORS");
      error.code = "CORS_ORIGIN_DENIED";
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"],
    optionsSuccessStatus: 204,
    maxAge: 600,
  };
}

function createApp(options = {}) {
  const app = express();
  const allowedOrigins = options.allowedOrigins || getAllowedOrigins();

  app.disable("x-powered-by");
  app.set("trust proxy", process.env.TRUST_PROXY || "loopback");
  app.use(requestIdMiddleware);
  app.use(requestLogger);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.use(cors(buildCorsOptions(allowedOrigins)));
  const bodyLimit = process.env.JSON_BODY_LIMIT || "1mb";
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));

  app.use("/api", authRoutes);
  app.use("/api/kategori", kategoriRoutes);
  app.use("/api/produk", produkRoutes);
  app.use("/api/transaksi", transaksiRoutes);
  app.use("/api/dataset", datasetRoutes);
  app.use("/api/sales", salesAggregationRoutes);
  app.use("/api/laporan", laporanRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/inventory-history", inventoryHistoryRoutes);
  app.use("/api/forecast/sales", salesForecastRoutes);
  app.use("/api/forecast", forecastRoutes);

  app.get("/", (req, res) => {
    res.json({
      service: "API Sistem Koperasi SACIKA",
      status: "ok",
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

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
  buildCorsOptions,
  createApp,
  getAllowedOrigins,
  validateRuntimeEnvironment,
};
