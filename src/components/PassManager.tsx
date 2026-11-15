import React, { useState, useEffect, useMemo } from 'react';
import type { Pass, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import {
  CreditCard,
  Calendar,
  Printer,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  Banknote,
  QrCode,
  User,
  Phone,
  RefreshCw
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
      const passes = await dbService.fetchRecentPasses(8);
      setRecentPasses(passes);
    } catch {
      const all = dbService.getLocalPasses();
      setRecentPasses(all.slice(0, 8));
    }
  };

  useEffect(() => {
    loadPasses();
    setPricingRates(dbService.getPricingRates());
    const interval = setInterval(() => {
      loadPasses();
      setPricingRates(dbService.getPricingRates());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="max-w-[1440px] xl:max-w-[1560px] mx-auto w-full p-2 sm:p-4 space-y-4">
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

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      paymentMode === 'CASH'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-1 ring-emerald-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>1. Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('UPI')}
                    className={`py-2 px-3 rounded-xl font-black text-xs sm:text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      paymentMode === 'UPI'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 shadow-md shadow-blue-600/25 ring-1 ring-blue-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <QrCode className="w-4 h-4" />
                    <span>2. UPI</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Total and Submit Hero Bar (Anchored at Bottom) */}
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 p-3 sm:p-3.5 rounded-2xl shadow-lg border border-emerald-600/50 flex items-center justify-between gap-3 text-white mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-200 font-extrabold">Total Fee</div>
                <div className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
                  ₹{totalAmountInr.toFixed(2)}
                </div>
                <div className="text-[10px] text-emerald-100 font-medium">
                  {passType === 'MONTHLY' ? `${validityDays} Days` : '365 Days'} • 1 Person Allowed
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="px-6 py-2.5 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-950 font-black rounded-xl shadow-lg shadow-black/20 flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-50 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-700" />
                <span>{isGenerating ? 'Generating...' : 'Issue & Print Pass'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar: Active Passes List */}
        <div className="lg:col-span-5 bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-2xl p-4 shadow-md shadow-emerald-950/10 backdrop-blur-xl flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between border-b border-emerald-950/10 pb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Active Passes Issued</span>
              <button
                type="button"
                onClick={loadPasses}
                className="p-1 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                title="Refresh passes list"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </h3>
            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {recentPasses.length} Total
            </span>
          </div>

          <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 min-h-[220px] max-h-[340px] sm:max-h-[380px] pr-1">
            {recentPasses.length === 0 ? (
              <div className="py-8 text-center space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                  <CreditCard className="w-5 h-5 opacity-60" />
                </div>
                <p className="text-xs text-slate-400 font-medium">No subscription passes issued yet today.</p>
              </div>
            ) : (
              recentPasses.map(pass => (
                <div
                  key={pass.id}
                  className="bg-white p-2.5 rounded-xl border border-slate-200/90 hover:border-emerald-300 transition space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-black px-2 py-0.2 rounded-full ${
                      pass.pass_type === 'YEARLY'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {pass.pass_type === 'YEARLY' ? 'YEARLY' : 'MONTHLY'}
                    </span>
                    <span className="font-mono text-[11px] font-black text-slate-700">{pass.pass_number}</span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="font-black text-slate-900 text-xs flex items-center gap-1 truncate max-w-[170px]">
                      <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate">{pass.holder_name}</span>
                    </span>
                    <span className="text-xs text-emerald-700 font-black">
                      ₹{((pass.amount_paise || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500 font-medium flex justify-between items-center pt-0.5 border-t border-slate-100">
                    <span>Valid: {pass.valid_through}</span>
                    <button
                      type="button"
                      onClick={() => handleReprint(pass)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-emerald-600 hover:text-white rounded text-[10px] font-black flex items-center gap-1 transition cursor-pointer"
                    >
                      <Printer className="w-2.5 h-2.5" /> Re-Print
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
