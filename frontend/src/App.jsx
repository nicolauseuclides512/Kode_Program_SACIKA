import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useContext } from "react";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Produk from "./pages/produk/Produk";
import Kategori from "./pages/kategori/Kategori";
import Prediksi from "./pages/prediksi/Prediksi";
import Report from "./pages/report/Report";

import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./auth/ProtectedRoute";
import TransaksiMasuk from "./pages/transaksi/TransaksiMasuk";
import TransaksiKeluar from "./pages/transaksi/TransaksiKeluar";
import AuthContext from "./auth/AuthContext";

function App() {
  const { user } = useContext(AuthContext);

  return (
    <BrowserRouter>
      <title>Koperasi Sacika</title>
      <Routes>
        {}
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

        {}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/produk"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Produk />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/prediksi"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Prediksi />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/kategori"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Kategori />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/laporan"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Report />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transaksi/masuk"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <TransaksiMasuk />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transaksi/keluar"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <TransaksiKeluar />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
