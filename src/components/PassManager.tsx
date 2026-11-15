import React, { useState, useEffect, useMemo } from 'react';
import type { Pass, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import {
  Calendar,
  Printer,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  Banknote,
  QrCode,
  User,
  Phone,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

interface PassManagerProps {
  config: AppConfig;
  onTicketGenerated: (pass: Pass) => void;
}

export const PassManager: React.FC<PassManagerProps> = ({ config, onTicketGenerated }) => {
  const [passType, setPassType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [holderName, setHolderName] = useState('');
  const [holderPhone, setHolderPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [validityDays, setValidityDays] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentPasses, setRecentPasses] = useState<Pass[]>([]);
  const [pricingRates, setPricingRates] = useState(() => dbService.getPricingRates());

  // Search filter for re-printing passes by Mobile number or Name
  const [searchQuery, setSearchQuery] = useState('');
  const [cloudSearchResults, setCloudSearchResults] = useState<Pass[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Dynamic base rate calculation from Admin settings:
  const baseRateInr = useMemo(() => {
    if (passType === 'YEARLY') {
      return pricingRates.yearly_pass_inr;
    }
    if (validityDays === 60) return pricingRates.monthly_pass_2m_inr;
    if (validityDays === 90) return pricingRates.monthly_pass_3m_inr;
    return pricingRates.monthly_pass_1m_inr;
  }, [passType, validityDays, pricingRates]);

  const totalAmountInr = baseRateInr;

  useEffect(() => {
    if (passType === 'MONTHLY') {
      setValidityDays(30);
    } else {
      setValidityDays(365);
    }
  }, [passType]);

  const loadPasses = async () => {
    try {
      const passes = await dbService.fetchRecentPasses(30);
      setRecentPasses(passes);
    } catch {
      const all = dbService.getLocalPasses();
      setRecentPasses(all.slice(0, 30));
    }
  };

  useEffect(() => {
    loadPasses();
    setPricingRates(dbService.getPricingRates());
    const interval = setInterval(() => {
      loadPasses();
      setPricingRates(dbService.getPricingRates());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Live & Cloud Search by mobile number or name
  useEffect(() => {
    const q = searchQuery.trim();
    const cleanDigits = q.replace(/\D/g, '');
    if (cleanDigits.length >= 4 || q.length >= 3) {
      const timer = setTimeout(async () => {
        setIsSearching(true);
        try {
          if (cleanDigits.length >= 4) {
            const res = await dbService.searchPassByPhone(cleanDigits);
            setCloudSearchResults(res);
          } else {
            const local = dbService.getLocalPasses();
            const matches = local.filter(p =>
              (p.holder_name && p.holder_name.toLowerCase().includes(q.toLowerCase())) ||
              (p.pass_number && p.pass_number.toLowerCase().includes(q.toLowerCase()))
            );
            setCloudSearchResults(matches);
          }
        } catch (e) {
          console.warn('Search pass error:', e);
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setCloudSearchResults([]);
    }
  }, [searchQuery]);

  // Combined passes matching search query
  const filteredPasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');

    const combined = [...cloudSearchResults];
    for (const p of recentPasses) {
      if (!combined.some(c => c.id === p.id || c.pass_number === p.pass_number)) {
        combined.push(p);
      }
    }

    if (!q) return recentPasses;

    return combined.filter(p => {
      const pPhone = (p.holder_phone || '').replace(/\D/g, '');
      const pName = (p.holder_name || '').toLowerCase();
      const pNum = (p.pass_number || '').toLowerCase();

      if (digits && pPhone.includes(digits)) return true;
      if (pName.includes(q)) return true;
      if (pNum.includes(q)) return true;
      return false;
    });
  }, [recentPasses, cloudSearchResults, searchQuery]);

  const handleGeneratePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holderName.trim()) {
      alert('Please enter Pass Holder Name');
      return;
    }

    setIsGenerating(true);
    try {
      const pass = await dbService.issuePass({
        pass_type: passType,
        holder_name: holderName.trim(),
        holder_phone: holderPhone.trim() || undefined,
        people_allowed: 1,
        payment_method: paymentMode,
        duration_days: validityDays,
        price_paise: totalAmountInr * 100,
      });

      onTicketGenerated(pass);
      loadPasses();

      // Trigger Print
      if (printerService.isConnected) {
        await printerService.printViaBluetooth(pass, config);
      } else {
        setTimeout(() => {
          printerService.printViaBrowser();
        }, 100);
      }

      setHolderName('');
      setHolderPhone('');
      const durationLabel = passType === 'MONTHLY'
        ? (validityDays === 30 ? '1 Month (₹300)' : validityDays === 60 ? '2 Months (₹600)' : '3 Months (₹900)')
        : '1 Year (₹3,100)';
      alert(`Success! ${passType === 'MONTHLY' ? 'Monthly Pass' : 'Yearly Pass'} [${durationLabel}] issued and sent to printer.`);
    } catch (err) {
      console.error(err);
      alert('Failed to issue pass. Please check your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReprint = (pass: Pass) => {
    onTicketGenerated(pass);
    if (printerService.isConnected) {
      printerService.printViaBluetooth(pass, config);
    } else {
      setTimeout(() => {
        printerService.printViaBrowser();
      }, 100);
    }
  };

  return (
    <div className="max-w-[1440px] xl:max-w-[1560px] mx-auto w-full px-2 sm:px-4 py-1 space-y-3">
      {/* Compact Title Header with Logo & Mode Switcher */}
      <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-2xl px-4 py-2.5 sm:py-3 shadow-md shadow-emerald-950/10 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative group shrink-0">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Logo"
              className="relative w-10 h-10 object-contain rounded-xl border border-white/80 p-0.5 bg-white shadow-xs"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                Subscription Passes
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Pass Desk
              </span>
            </div>
            <p className="text-slate-500 text-[10px] sm:text-[11px] font-medium">
              Issue Monthly (1, 2, 3 Months) & Yearly regular walker passes with instant thermal QR badge slips.
            </p>
          </div>
        </div>

        {/* Pass Type Switcher Tabs with Vibrant Gradients */}
        <div className="w-full sm:w-auto grid grid-cols-2 bg-slate-100/90 backdrop-blur-md p-1 rounded-xl border border-slate-200/80 shadow-2xs gap-1">
          <button
            type="button"
            onClick={() => setPassType('MONTHLY')}
            className={`px-3.5 py-1.5 rounded-lg font-black text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              passType === 'MONTHLY'
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>Monthly (₹300 - ₹900)</span>
          </button>
          <button
            type="button"
            onClick={() => setPassType('YEARLY')}
            className={`px-3.5 py-1.5 rounded-lg font-black text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              passType === 'YEARLY'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>Yearly (₹3,100)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Pass Issuance Form */}
        <div className="lg:col-span-7 bg-gradient-to-br from-white via-white to-emerald-50/30 border border-white/70 rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-950/15 backdrop-blur-xl flex flex-col justify-between">
          <form onSubmit={handleGeneratePass} className="flex-1 flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-emerald-950/10 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                      New {passType === 'YEARLY' ? 'Yearly Pass (1 Year)' : `Monthly Pass (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})`}
                    </h2>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  passType === 'YEARLY'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {passType}
                </span>
              </div>

              {/* Holder Full Name & Phone side-by-side to save height */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black mb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-emerald-600" />
                    <span>Pass Holder Name *</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar Sharma"
                    value={holderName}
                    onChange={e => setHolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm shadow-2xs transition"
                  />
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>Mobile Number</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 98XXXXXXXX (Optional)"
                    value={holderPhone}
                    onChange={e => setHolderPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm shadow-2xs transition"
                  />
                </div>
              </div>

              {/* Validity Duration Quick Tap Chips */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-600" />
                  <span>Select Validity Duration</span>
                </label>

                {passType === 'MONTHLY' ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { days: 30, label: '1 Month', price: '₹300' },
                      { days: 60, label: '2 Months', price: '₹600' },
                      { days: 90, label: '3 Months', price: '₹900' },
                    ].map(plan => {
                      const isSelected = validityDays === plan.days;
                      return (
                        <button
                          key={plan.days}
                          type="button"
                          onClick={() => setValidityDays(plan.days)}
                          className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                              : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {plan.label}
                          </div>
                          <div className={`text-[10px] font-black mt-0.5 ${
                            isSelected ? 'text-emerald-100' : 'text-emerald-700'
                          }`}>
                            {plan.price}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-[10px]">
                        1Y
                      </div>
                      <div className="text-xs font-black text-slate-900">365 Days Regular Entry (Full Year)</div>
                    </div>
                    <span className="text-xs font-black text-purple-900 bg-white px-2.5 py-0.5 rounded-lg border border-purple-200">
                      ₹3,100.00
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Mode Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black flex items-center gap-1">
                  <Banknote className="w-3 h-3 text-emerald-600" />
                  <span>Payment Mode</span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-3 sm:py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                      paymentMode === 'CASH'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400 scale-[1.01]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <Banknote className="w-5 h-5 shrink-0" />
                    <span>1. Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('UPI')}
                    className={`py-3 sm:py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                      paymentMode === 'UPI'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-md shadow-blue-600/30 ring-2 ring-blue-400 scale-[1.01]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <QrCode className="w-5 h-5 shrink-0" />
                    <span>2. UPI</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Total and Submit Hero Bar (Anchored at Bottom) */}
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 p-3.5 sm:p-4 rounded-2xl shadow-lg border border-emerald-600/50 flex items-center justify-between gap-3 text-white mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-200 font-extrabold">Total Fee</div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                  ₹{totalAmountInr.toFixed(2)}
                </div>
                <div className="text-[11px] text-emerald-100 font-semibold">
                  Pass Validity: {passType === 'MONTHLY' ? `${validityDays} Days (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})` : '365 Days (1 Year Regular Entry)'}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="px-6 py-3 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-950 font-black rounded-xl shadow-lg shadow-black/20 flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-50 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-700" />
                <span>{isGenerating ? 'Generating...' : 'Issue & Print Pass'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar: Active Passes List */}
        <div className="lg:col-span-5 bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-950/15 backdrop-blur-xl flex flex-col h-full space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-950/10 pb-2.5 shrink-0">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Active Passes Issued</span>
              <button
                type="button"
                onClick={loadPasses}
                className="p-1 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                title="Refresh passes list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </h3>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/70">
              {filteredPasses.length} {searchQuery ? 'Found' : 'Total'}
            </span>
          </div>

          {/* Search by Mobile Number / Name Filter */}
          <div className="relative shrink-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4 text-emerald-600" />
            </div>
            <input
              type="text"
              placeholder="Search by Mobile # (e.g. 98...) or Name to Re-Print..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner font-mono"
            />
            {isSearching ? (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-600 pointer-events-none">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </div>
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Dynamic Height Scrollable Box: Seamlessly fills remaining height with zero gap */}
          <div className="flex-1 min-h-[280px] max-h-[460px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {filteredPasses.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-200 shadow-2xs">
                  <Phone className="w-6 h-6 opacity-60" />
                </div>
                <p className="text-xs text-slate-700 font-bold max-w-xs">
                  {searchQuery ? `No pass found matching "${searchQuery}"` : 'No subscription passes issued yet today.'}
                </p>
                {searchQuery && (
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Please check the 10-digit mobile number or name spelling.
                  </p>
                )}
              </div>
            ) : (
              filteredPasses.map(pass => (
                <div
                  key={pass.id}
                  className="bg-white hover:bg-emerald-50/20 p-3 rounded-xl border border-slate-200/90 hover:border-emerald-400 transition-all duration-150 space-y-2 group shadow-2xs hover:shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    {(() => {
                      const isYearly = pass.pass_type === 'YEARLY';
                      const pName = (pass.plan_name || '').toLowerCase();
                      const amt = pass.amount_paise || 0;
                      let badgeLabel = '1 Month (30D)';
                      let badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      if (isYearly) {
                        badgeLabel = '1 Year (365D)';
                        badgeStyle = 'bg-purple-100 text-purple-800 border-purple-200';
                      } else if (pName.includes('3 month') || amt === 90000) {
                        badgeLabel = '3 Months (90D)';
                        badgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                      } else if (pName.includes('2 month') || amt === 60000) {
                        badgeLabel = '2 Months (60D)';
                        badgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
                      }
                      return (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                          {badgeLabel}
                        </span>
                      );
                    })()}
                    <span className="font-mono text-xs font-black text-slate-700">{pass.pass_number}</span>
                  </div>

                  <div className="flex justify-between items-baseline gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-black text-slate-900 text-sm flex items-center gap-1.5 truncate">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">{pass.holder_name}</span>
                      </span>
                      {pass.holder_phone && (
                        <div className="text-[11px] text-slate-600 font-mono font-bold flex items-center gap-1.5 mt-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/70 w-fit">
                          <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{pass.holder_phone}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-base font-black text-emerald-800 shrink-0">
                      ₹{((pass.amount_paise || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-medium flex justify-between items-center pt-1.5 border-t border-slate-100">
                    <span className="font-medium text-slate-600">Valid: <strong className="font-mono font-bold text-slate-800">{pass.valid_through}</strong></span>
                    <button
                      type="button"
                      onClick={() => handleReprint(pass)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 rounded-lg text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                    >
                      <Printer className="w-3 h-3" /> Re-Print
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
