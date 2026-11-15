import React from 'react';
import type { AppConfig, AuthStaff } from '../types';
import { Ticket, CreditCard, Camera, BarChart3, LogOut } from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

interface NavbarProps {
  activeTab: 'counter' | 'passes' | 'scanner' | 'logs';
  setActiveTab: (tab: 'counter' | 'passes' | 'scanner' | 'logs') => void;
  config: AppConfig;
  staff: AuthStaff | null;
  onOpenSettings?: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  config,
  staff,
  onLogout,
}) => {
  const role = staff?.role || 'COUNTER';
  const isAdmin = role === 'SUPER_ADMIN';
  const isCounter = role === 'COUNTER' || isAdmin;
  const isGate = role === 'GATE' || isAdmin;
  const isPassesEnabled = config.park_settings?.enable_passes !== false;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-emerald-950/10 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2.5 sm:gap-3">
        {/* Brand with Official Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative group cursor-pointer shrink-0">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Ved Upvan Park Logo"
              className="relative w-9 h-9 sm:w-11 sm:h-11 object-contain rounded-xl border border-white/80 shadow-xs bg-white p-0.5"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="font-black text-slate-900 text-xs sm:text-base leading-tight tracking-tight truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
              {config.park_settings.park_name}
            </div>
            <div className="text-[9px] sm:text-[11px] text-emerald-800 font-extrabold tracking-wide flex items-center gap-1 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
              <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate">{config.park_settings.organization_name} • Sirsaganj</span>
            </div>
          </div>
        </div>

        {/* Role-Restricted Navigation Tabs (Desktop & Tablet only - Mobile uses bottom nav) */}
        <nav className="hidden md:flex items-center bg-slate-100/90 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 shadow-2xs gap-1 shrink-0">
          {/* Admin Dashboard */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 lg:px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 lg:gap-2 transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>
                <span className="hidden lg:inline">Admin Reports & Analytics</span>
                <span className="lg:hidden">Admin</span>
              </span>
            </button>
          )}

          {/* Ticket Counter */}
          {isCounter && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('counter')}
                className={`px-3 lg:px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 lg:gap-2 transition-all cursor-pointer ${
                  activeTab === 'counter'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Ticket className="w-4 h-4 shrink-0" />
                <span>
                  <span className="hidden lg:inline">Ticket POS</span>
                  <span className="lg:hidden">POS</span>
                </span>
              </button>

              {isPassesEnabled && (
                <button
                  type="button"
                  onClick={() => setActiveTab('passes')}
                  className={`px-3 lg:px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 lg:gap-2 transition-all cursor-pointer ${
                    activeTab === 'passes'
                      ? 'bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-500 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span>Passes</span>
                </button>
              )}
            </>
          )}

          {/* Gate Scanner */}
          {isGate && (
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`px-3 lg:px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 lg:gap-2 transition-all cursor-pointer ${
                activeTab === 'scanner'
                  ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 text-white shadow-md shadow-amber-600/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>
                <span className="hidden lg:inline">Gate Scanner</span>
                <span className="lg:hidden">Scanner</span>
              </span>
            </button>
          )}
        </nav>

        {/* User Profile & Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Active Staff Badge */}
          {staff && (
            <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-slate-50 to-slate-100/90 px-2 lg:px-3.5 py-1.5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-xs flex items-center justify-center shadow-xs shadow-emerald-500/20 shrink-0">
                {staff.name ? staff.name.slice(0, 2).toUpperCase() : 'ST'}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-[11px] font-black text-slate-900 leading-none truncate max-w-[120px]">{staff.name}</div>
                <div className="text-[10px] font-black text-emerald-700 uppercase mt-0.5 tracking-wider">
                  {staff.role === 'SUPER_ADMIN' ? 'Administrator' :
                   staff.role === 'GATE' ? 'Gate Security' : 'Ticket Counter'}
                </div>
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="p-2 bg-slate-100/80 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl transition border border-slate-200 cursor-pointer active:scale-95"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
