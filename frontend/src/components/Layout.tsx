import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import InstallPrompt from './InstallPrompt';
import RentBellWatcher from './RentBellWatcher';
import { can, canRoute, isAdmin } from '../lib/permissions';
import {
  Home,
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Wrench,
  FileText,
  Settings,
  ChevronDown,
  Sparkles,
  Bell,
  Megaphone,
  TrendingUp,
  ShieldCheck,
  Car,
  FolderOpen,
  Menu,
  X,
  MoreHorizontal,
} from 'lucide-react';

const FINANCE_ITEMS = [
  { to: '/finance', label: '財務總覽', exact: true },
  { to: '/finance/workbench', label: '收款工作台', exact: false },
  { to: '/finance/bell', label: '收費鈴聲', exact: false },
  { to: '/finance/records', label: '月租收費紀錄', exact: false },
  { to: '/finance/stats', label: '月租與收入統計', exact: false },
  { to: '/finance/rent', label: '租金管理', exact: false },
  { to: '/finance/reconcile', label: '對帳中心', exact: false },
  { to: '/finance/expenses', label: '支出記錄', exact: false },
  { to: '/finance/tax', label: '租賃報稅', exact: false },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [financeOpen, setFinanceOpen] = useState(location.pathname.startsWith('/finance'));
  const [urgentCount, setUrgentCount] = useState(0);
  // 手機：側邊選單改為抽屜
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!can(user, 'dashboard')) return;
    api.get('/dashboard').then((r) => {
      const d = r.data;
      setUrgentCount((d.rentSummary?.overdueCount ?? 0) + (d.pendingMaintenance ?? 0));
    }).catch(() => {});
  }, [location.pathname]);

  const isFinanceActive = location.pathname.startsWith('/finance');

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <div className="flex h-screen h-[100dvh] bg-warm overflow-hidden">
      <InstallPrompt />
      {can(user, 'finance') && <RentBellWatcher />}
      {/* Sidebar */}
      {menuOpen && <div className="md:hidden fixed inset-0 bg-black/40 z-[55]" onClick={() => setMenuOpen(false)} />}
      <aside
        className={`${menuOpen ? 'fixed inset-y-0 left-0 z-[56] flex shadow-2xl pt-safe' : 'hidden'} md:static md:z-auto md:shadow-none md:pt-0 md:flex flex-col w-64 max-w-[80vw] md:w-56 bg-white border-r border-gray-100 flex-shrink-0`}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
              <Home className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-bold text-gray-800 text-sm leading-tight">ParkMate</div>
              <div className="text-xs text-gray-400">停車位月租平台</div>
            </div>
            <button onClick={() => setMenuOpen(false)} className="md:hidden ml-auto p-1.5 rounded-lg hover:bg-gray-100" aria-label="關閉選單">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Workspace box */}
        <div className="mx-3 mt-3 mb-1 bg-warm rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">目前工作區</span>
            </div>
            <span className="text-xs bg-brand/10 text-brand px-1.5 py-0.5 rounded-full font-medium">{isAdmin(user) ? '管理員' : '員工'}</span>
          </div>
          <div className="font-semibold text-gray-700 text-sm">{user?.name}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-5 h-5 bg-brand rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{user?.name?.charAt(0)}</span>
            </div>
            <span className="text-xs text-gray-400 truncate">{user?.email}</span>
          </div>
        </div>

        {/* Urgent alert strip */}
        {urgentCount > 0 && (
          <button
            onClick={() => navigate('/finance/workbench')}
            className="mx-3 mb-1 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 w-[calc(100%-1.5rem)] hover:bg-red-100 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-xs text-red-600 font-medium">{urgentCount} 項需要優先處理</span>
            <span className="ml-auto w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-bold">{urgentCount}</span>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {can(user, 'dashboard') && <SidebarLink to="/" label="總覽" icon={LayoutDashboard} exact />}
          {can(user, 'properties') && <SidebarLink to="/properties" label="車位" icon={Building2} />}
          {can(user, 'tenants') && <SidebarLink to="/tenants" label="車主" icon={Users} />}
          {can(user, 'tenants') && <SidebarLink to="/vehicles" label="車牌查詢" icon={Car} />}

          {/* 帳務 submenu */}
          {can(user, 'finance') && <div>
            <button
              onClick={() => setFinanceOpen(!financeOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                isFinanceActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                帳務
              </div>
              <ChevronDown className={`w-3 h-3 transition-transform ${financeOpen ? 'rotate-180' : ''}`} />
            </button>
            {financeOpen && (
              <div className="ml-3 mt-0.5 border-l-2 border-gray-100 pl-3 space-y-0.5">
                {FINANCE_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) =>
                      `block px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive ? 'text-brand bg-brand/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>}

          {can(user, 'listings') && <SidebarLink to="/listings" label="空位刊登" icon={Megaphone} />}
          {can(user, 'roi') && <SidebarLink to="/roi" label="投報分析" icon={TrendingUp} />}
          {can(user, 'maintenance') && <SidebarLink to="/maintenance" label="報修" icon={Wrench} />}
          {can(user, 'contracts') && <SidebarLink to="/contracts" label="合約" icon={FileText} />}
          <SidebarLink to="/files" label="檔案庫" icon={FolderOpen} />
          {can(user, 'settings') && <SidebarLink to="/settings" label="設定" icon={Settings} />}
          <SidebarLink to="/accounts" label={isAdmin(user) ? '帳號權限' : '我的帳號'} icon={ShieldCheck} />
        </nav>

        {/* Bottom tip */}
        {can(user, 'settings') && <div className="hidden md:block mx-3 mb-3 bg-warm rounded-xl p-3 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span className="text-xs font-semibold text-gray-600">使用小秘訣</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">建立收款提醒，自動掌握每月收租進度</p>
          <button onClick={() => navigate('/settings')} className="w-full text-xs bg-brand text-white rounded-lg py-1.5 font-medium hover:bg-brand-dark transition-colors">
            立即設定
          </button>
        </div>}

        <div className="px-3 pb-3 pb-safe flex items-center justify-between gap-2">
          <span className="text-xs text-gray-300 pl-1">ParkMate v1.0.0</span>
          <button onClick={handleLogout} className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-red-200 hover:text-red-500 transition-colors">
            登出
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-2 bg-white border-b border-gray-100 px-3 pb-2 pt-safe-2 flex-shrink-0">
          <button onClick={() => setMenuOpen(true)} className="p-2 -ml-1 rounded-lg hover:bg-gray-100" aria-label="開啟選單">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <Home className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-gray-800 text-sm">ParkMate</span>
          {urgentCount > 0 && (
            <button onClick={() => navigate('/finance/workbench')} className="ml-auto flex items-center gap-1 bg-red-50 text-red-600 text-xs font-medium rounded-full px-2.5 py-1">
              <Bell className="w-3.5 h-3.5" />{urgentCount} 項待處理
            </button>
          )}
        </header>
        <main className="flex-1 overflow-y-auto pb-bottom-nav md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-40 shadow-lg pb-safe">
          {[
            { to: '/', label: '總覽', icon: LayoutDashboard, exact: true },
            { to: '/vehicles', label: '車牌', icon: Car, exact: false },
            { to: '/properties', label: '車位', icon: Building2, exact: false },
            { to: '/finance', label: '帳務', icon: CreditCard, exact: false },
            { to: '/tenants', label: '車主', icon: Users, exact: false },
            { to: '/contracts', label: '合約', icon: FileText, exact: false },
          ].filter((item) => canRoute(user, item.to)).slice(0, 4).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${isActive ? 'text-brand' : 'text-gray-400'}`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-brand' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                  {isActive && <div className="w-1 h-1 rounded-full bg-brand" />}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMenuOpen(true)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${menuOpen ? 'text-brand' : 'text-gray-400'}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>更多</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ to, label, icon: Icon, exact }: { to: string; label: string; icon: React.FC<{className?: string}>; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
          isActive ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  );
}
