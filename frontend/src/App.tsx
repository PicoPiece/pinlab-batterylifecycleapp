import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { BatteriesPage } from "./pages/BatteriesPage";
import { BatteryDetailPage } from "./pages/BatteryDetailPage";
import { BatteryFormPage } from "./pages/BatteryFormPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InspectionPage } from "./pages/InspectionPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/batteries" element={<BatteriesPage />} />
        <Route path="/batteries/new" element={<BatteryFormPage />} />
        <Route path="/batteries/:id" element={<BatteryDetailPage />} />
        <Route path="/batteries/:id/edit" element={<BatteryFormPage />} />
        <Route path="/batteries/:id/inspections/new" element={<InspectionPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
