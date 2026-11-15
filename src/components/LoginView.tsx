import React, { useState } from 'react';
import type { AuthStaff, AppConfig } from '../types';
import { dbService } from '../lib/supabase';
import { NatureBackground } from './NatureBackground';
import { Lock, User, Eye, EyeOff, Loader2, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

interface LoginViewProps {
  config?: AppConfig;
  onLoginSuccess: (staff: AuthStaff) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMessage('Please enter your Login ID.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await dbService.loginStaff(identifier, password);
      if (res.success && res.staff) {
        onLoginSuccess(res.staff);
      } else {
        setErrorMessage(res.message || 'Incorrect Login ID or Password.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed. Please check network connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#031d16] flex flex-col justify-center items-center px-4 py-6 relative overflow-y-auto select-none font-sans">
      {/* Living Park Nature & Greenery Animated Background */}
      <NatureBackground />

      <div className="max-w-[420px] w-full flex flex-col items-center justify-center relative z-10 my-auto">
        {/* Park Logo */}
        <div className="text-center mb-3 sm:mb-4">
          <div className="inline-block p-2 sm:p-2.5 bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-[0_15px_35px_rgba(0,0,0,0.5)] ring-2 ring-white/80 border border-emerald-400/30 transform hover:scale-[1.03] transition-all duration-300">
            <img
              src={LOGO_URL}
              alt="Ved Upvan Park Logo"
              className="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto rounded-xl"
            />
          </div>
        </div>

        {/* Compact Grand Modern Login Card */}
        <div className="w-full bg-white/95 backdrop-blur-2xl rounded-3xl p-5 sm:p-7 shadow-[0_25px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.7)] border border-white/80 space-y-4">
          {/* Card Top Header */}
          <div className="text-center space-y-1 border-b border-slate-100 pb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] sm:text-xs font-bold border border-emerald-200 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Official System Access</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Login Portal
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Enter your credentials to access system
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 pt-0.5">
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold text-center flex items-center justify-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Login ID Input */}
            <div className="space-y-1">
              <label className="block text-xs sm:text-sm font-bold text-slate-800">
                Login ID <span className="text-emerald-600 font-black">*</span>
              </label>
              <div className="relative group">
                <User className="w-4.5 h-4.5 text-slate-400 group-focus-within:text-emerald-600 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200" />
                <input
                  type="text"
                  required
                  placeholder="Enter your login ID"
                  value={identifier}
                  onChange={e => {
                    setIdentifier(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-50/80 border-2 border-slate-200 rounded-xl text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 transition-all duration-200 shadow-xs"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label className="block text-xs sm:text-sm font-bold text-slate-800">
                Password <span className="text-emerald-600 font-black">*</span>
              </label>
              <div className="relative group">
                <Lock className="w-4.5 h-4.5 text-slate-400 group-focus-within:text-emerald-600 absolute left-3.5 top-3 pointer-events-none transition-colors duration-200" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={password}
                  onClick={() => setPassword('')}
                  onFocus={() => setPassword('')}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-slate-50 hover:bg-slate-50/80 border-2 border-slate-200 rounded-xl text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-500/15 transition-all duration-200 shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2 sm:top-2.5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <div className="pt-1.5">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 sm:py-3.5 px-5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-extrabold rounded-xl text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-700/35 hover:shadow-xl hover:shadow-emerald-600/50 transition-all duration-200 disabled:opacity-50 cursor-pointer border border-emerald-400/30 tracking-wide"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer info */}
        <p className="mt-3 text-center text-[11px] sm:text-xs text-emerald-100/80 font-medium drop-shadow flex items-center justify-center gap-1.5">
          <span>🔒 Secured System • Ved Upvan Park Sirsaganj</span>
        </p>
      </div>
    </div>
  );
};
