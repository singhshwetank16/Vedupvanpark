import React from 'react';
import type { AppConfig, AuthStaff } from '../types';
import { Ticket, CreditCard, Camera, BarChart3, LogOut, User } from 'lucide-react';
import { InstallAppBanner } from './InstallAppBanner';
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        {/* Brand with Official Logo */}
        <div className="flex items-center gap-3">
          <img
            src={LOGO_URL}
            alt="Ved Upvan Park Logo"
            className="w-11 h-11 object-contain rounded-xl border border-emerald-100 shadow-sm bg-white"
          />
          <div className="hidden sm:block">
            <div className="font-black text-slate-900 text-base leading-tight tracking-tight">
              {config.park_settings.park_name}
            </div>
            <div className="text-[11px] text-emerald-700 font-bold tracking-wide">
              {config.park_settings.organization_name} • Sirsaganj
            </div>
          </div>
        </div>

        {/* Role-Restricted Navigation Tabs (Desktop only - Mobile uses bottom nav) */}
        <nav className="hidden md:flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
          {/* Admin Dashboard */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'logs'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Admin Reports & Analytics</span>
            </button>
          )}

          {/* Ticket Counter */}
          {isCounter && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('counter')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'counter'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Ticket className="w-4 h-4" />
                <span>Ticket POS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('passes')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  activeTab === 'passes'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Passes</span>
              </button>
            </>
          )}

          {/* Gate Scanner */}
          {isGate && (
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'scanner'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Gate Scanner</span>
            </button>
          )}
        </nav>

        {/* User Profile & Actions */}
        <div className="flex items-center gap-2">
          {/* Install App Button */}
          <InstallAppBanner variant="compact" />

          {/* Active Staff Badge */}
          {staff && (
            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <User className="w-4 h-4 text-emerald-700" />
              <div className="text-left">
                <div className="text-[11px] font-bold text-slate-900 leading-none">{staff.name}</div>
                <div className="text-[10px] font-bold text-emerald-700 uppercase mt-0.5">
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
            className="p-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl transition border border-slate-200"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
