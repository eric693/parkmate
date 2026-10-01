import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { canRoute, firstAllowedRoute } from './lib/permissions';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Intro from './pages/Intro';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Tenants from './pages/Tenants';
import Contracts from './pages/Contracts';
import Finance from './pages/Finance';
import CollectionWorkbench from './pages/CollectionWorkbench';
import RentManagement from './pages/RentManagement';
import ExpenseRecords from './pages/ExpenseRecords';
import Reconciliation from './pages/Reconciliation';
import TaxReport from './pages/TaxReport';
import Maintenance from './pages/Maintenance';
import Settings from './pages/Settings';
import SignContract from './pages/SignContract';
import Listings from './pages/Listings';
import ROIAnalysis from './pages/ROIAnalysis';
import Vehicles from './pages/Vehicles';
import RentBell from './pages/RentBell';
import RentStats from './pages/RentStats';
import DormRecords from './pages/DormRecords';
import Accounts from './pages/Accounts';
import Files from './pages/Files';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">載入中...</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

/** 員工進到沒有權限的頁面：首頁導到第一個可用頁，其他顯示無權限 */
function PermissionGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (canRoute(user, pathname)) return <>{children}</>;
  if (pathname === '/') return <Navigate to={firstAllowedRoute(user)} replace />;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="text-gray-700 font-semibold mb-1">您沒有使用此功能的權限</div>
      <div className="text-sm text-gray-400">如需開通，請聯絡管理員到「帳號權限」設定。</div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/intro" element={<Intro />} />
          <Route path="/sign/:token" element={<SignContract />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<PermissionGate><Dashboard /></PermissionGate>} />
            <Route path="properties" element={<PermissionGate><Properties /></PermissionGate>} />
            <Route path="tenants" element={<PermissionGate><Tenants /></PermissionGate>} />
            <Route path="vehicles" element={<PermissionGate><Vehicles /></PermissionGate>} />
            <Route path="finance" element={<PermissionGate><Finance /></PermissionGate>} />
            <Route path="finance/workbench" element={<PermissionGate><CollectionWorkbench /></PermissionGate>} />
            <Route path="finance/rent" element={<PermissionGate><RentManagement /></PermissionGate>} />
            <Route path="finance/bell" element={<PermissionGate><RentBell /></PermissionGate>} />
            <Route path="finance/stats" element={<PermissionGate><RentStats /></PermissionGate>} />
            <Route path="finance/records" element={<PermissionGate><DormRecords /></PermissionGate>} />
            <Route path="finance/reconcile" element={<PermissionGate><Reconciliation /></PermissionGate>} />
            <Route path="finance/expenses" element={<PermissionGate><ExpenseRecords /></PermissionGate>} />
            <Route path="finance/tax" element={<PermissionGate><TaxReport /></PermissionGate>} />
            <Route path="contracts" element={<PermissionGate><Contracts /></PermissionGate>} />
            <Route path="listings" element={<PermissionGate><Listings /></PermissionGate>} />
            <Route path="roi" element={<PermissionGate><ROIAnalysis /></PermissionGate>} />
            <Route path="maintenance" element={<PermissionGate><Maintenance /></PermissionGate>} />
            <Route path="files" element={<PermissionGate><Files /></PermissionGate>} />
            <Route path="settings" element={<PermissionGate><Settings /></PermissionGate>} />
            <Route path="accounts" element={<Accounts />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
