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
  X,
  AlertTriangle
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

  // Active pass duplicate check for entered mobile number
  const [existingActivePass, setExistingActivePass] = useState<Pass | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);

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

  // Real-time phone number numeric validation
  const phoneValidation = useMemo(() => {
    const raw = holderPhone.trim();
    if (!raw) {
      return { isValid: false, status: 'EMPTY', message: '10-digit mobile number required' };
    }
    if (!/^\d+$/.test(raw)) {
      return { isValid: false, status: 'INVALID_CHARS', message: 'Only numbers (0-9) allowed' };
    }
    if (raw.length > 0 && !/^[6-9]/.test(raw)) {
      return { isValid: false, status: 'INVALID_START', message: 'Must start with 6, 7, 8, or 9' };
    }
    if (raw.length < 10) {
      return { isValid: false, status: 'INCOMPLETE', message: `${10 - raw.length} more digits needed (${raw.length}/10)` };
    }
    if (raw.length === 10 && /^[6-9]\d{9}$/.test(raw)) {
      return { isValid: true, status: 'VALID', message: '✓ Valid 10-digit Mobile Number' };
    }
    return { isValid: false, status: 'INVALID', message: 'Invalid 10-digit mobile number' };
  }, [holderPhone]);

  // Real-time 10-digit validation for the search box
  const searchValidation = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    const isDigitsOnly = /^\d+$/.test(q);
    if (!isDigitsOnly) {
      return { type: 'NAME', isValid: true, status: 'NAME', message: `Searching by Name: "${q}"` };
    }
    const digits = q.replace(/\D/g, '');
    if (digits.length > 0 && !/^[6-9]/.test(digits)) {
      return {
        type: 'PHONE',
        isValid: false,
        status: 'INVALID_START',
        message: 'Must start with 6, 7, 8, or 9',
      };
    }
    if (digits.length < 10) {
      return {
        type: 'PHONE',
        isValid: false,
        status: 'INCOMPLETE',
        message: `${digits.length}/10 digits entered (${10 - digits.length} more needed)`,
      };
    }
    return {
      type: 'PHONE',
      isValid: true,
      status: 'VALID',
      message: `✓ 10-Digit Mobile: ${digits}`,
    };
  }, [searchQuery]);

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

  // Check if mobile number already has an active, non-expired pass
  useEffect(() => {
    const cleanDigits = holderPhone.replace(/\D/g, '').slice(-10);
    if (cleanDigits.length === 10) {
      let isMounted = true;
      setIsCheckingPhone(true);
      dbService
        .checkActivePassByPhone(cleanDigits)
        .then(found => {
          if (isMounted) {
            setExistingActivePass(found);
            setIsCheckingPhone(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsCheckingPhone(false);
        });
      return () => {
        isMounted = false;
      };
    } else {
      setExistingActivePass(null);
      setIsCheckingPhone(false);
    }
  }, [holderPhone]);

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
      alert('Please enter Pass Holder Name.');
      return;
    }

    const cleanDigits = holderPhone.replace(/\D/g, '').slice(-10);
    if (!cleanDigits) {
      alert('Mobile Number is mandatory! Please enter a 10-digit mobile number.');
      return;
    }
    if (cleanDigits.length !== 10) {
      alert(`Invalid Mobile Number! You entered ${cleanDigits.length} digits. Exactly 10 digits are required.`);
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      alert('Invalid Mobile Number! Mobile numbers in India must start with 6, 7, 8, or 9.');
      return;
    }

    // Verify if an active pass is already registered
    const activePass = await dbService.checkActivePassByPhone(cleanDigits);
    if (activePass) {
      setExistingActivePass(activePass);
      alert(
        `Active pass (${activePass.pass_number}) already exists for mobile number ${cleanDigits} valid until ${activePass.valid_through}!\n\nNew pass cannot be issued until the existing pass expires. You can re-print the existing pass.`
      );
      return;
    }

    setIsGenerating(true);
    try {
      const pass = await dbService.issuePass({
        pass_type: passType,
        holder_name: holderName.trim(),
        holder_phone: cleanDigits,
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
      setExistingActivePass(null);
      const durationLabel = passType === 'MONTHLY'
        ? (validityDays === 30 ? '1 Month (₹300)' : validityDays === 60 ? '2 Months (₹600)' : '3 Months (₹900)')
        : '1 Year (₹3,100)';
      alert(`Success! ${passType === 'MONTHLY' ? 'Monthly Pass' : 'Yearly Pass'} [${durationLabel}] issued and sent to printer.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to issue pass. Please check your connection.');
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
                  <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>Pass Holder Mobile Number *</span>
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                      phoneValidation.isValid
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                        : 'text-amber-800 bg-amber-50 border-amber-300'
                    }`}>
                      {phoneValidation.isValid ? '✓ 10 Digits' : 'Mandatory'}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[6-9][0-9]{9}"
                      required
                      maxLength={10}
                      placeholder="e.g. 9876543210 (10 Digits)"
                      value={holderPhone}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setHolderPhone(digits);
                      }}
                      className={`w-full px-3 py-2 bg-white border rounded-xl text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 text-xs sm:text-sm shadow-2xs transition font-mono ${
                        existingActivePass || (holderPhone.length > 0 && !phoneValidation.isValid && phoneValidation.status !== 'INCOMPLETE')
                          ? 'border-red-400 focus:ring-red-400 bg-red-50/20'
                          : phoneValidation.isValid
                            ? 'border-emerald-500 focus:ring-emerald-500 bg-emerald-50/20'
                            : 'border-slate-200 focus:ring-emerald-500'
                      }`}
                    />
                    {isCheckingPhone ? (
                      <div className="absolute right-2.5 top-2.5 text-emerald-600">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      </div>
                    ) : phoneValidation.isValid && !existingActivePass ? (
                      <div className="absolute right-2.5 top-2.5 text-emerald-600 font-black text-xs">
                        ✓
                      </div>
                    ) : null}
                  </div>

                  {/* Real-time Validation Helper Message */}
                  <div className="mt-1">
                    {phoneValidation.status === 'EMPTY' && (
                      <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                        <span className="text-red-500">*</span> Enter 10-digit mobile number (starts with 6, 7, 8, 9)
                      </span>
                    )}
                    {phoneValidation.status === 'INVALID_START' && (
                      <span className="text-[10px] text-red-600 font-bold flex items-center gap-1">
                        ❌ Invalid: Mobile number must start with 6, 7, 8, or 9
                      </span>
                    )}
                    {phoneValidation.status === 'INCOMPLETE' && (
                      <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                        ⚠️ {phoneValidation.message}
                      </span>
                    )}
                    {phoneValidation.status === 'VALID' && !existingActivePass && (
                      <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        ✓ Valid 10-Digit Mobile Number
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Pass Warning Banner */}
              {existingActivePass && (
                <div className="bg-amber-50/90 border-2 border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-amber-950 text-xs shadow-xs animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-black text-amber-900 flex items-center justify-between">
                      <span>Active Pass Already Exists for this Mobile!</span>
                      <span className="text-[10px] font-mono bg-amber-200/90 px-1.5 py-0.2 rounded text-amber-950 font-bold">
                        {existingActivePass.pass_number}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      Holder: <strong>{existingActivePass.holder_name}</strong> • Valid Through:{' '}
                      <strong className="text-red-700 font-mono font-black">{existingActivePass.valid_through}</strong>
                    </p>
                    <div className="pt-0.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleReprint(existingActivePass)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1 shadow-xs cursor-pointer transition"
                      >
                        <Printer className="w-3 h-3" /> Re-Print Existing Pass
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                disabled={isGenerating || !phoneValidation.isValid || existingActivePass !== null}
                className="px-6 py-3 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-950 font-black rounded-xl shadow-lg shadow-black/20 flex items-center justify-center gap-1.5 text-xs sm:text-sm disabled:opacity-50 transition cursor-pointer"
                title={
                  existingActivePass
                    ? 'Cannot issue pass: Active pass already exists for this mobile number'
                    : !phoneValidation.isValid
                      ? 'Please enter a valid 10-digit mobile number'
                      : undefined
                }
              >
                <Printer className="w-4 h-4 text-emerald-700" />
                <span>
                  {isGenerating
                    ? 'Generating...'
                    : existingActivePass
                      ? 'Active Pass Exists'
                      : !phoneValidation.isValid
                        ? 'Enter 10-Digit Mobile'
                        : 'Issue & Print Pass'}
                </span>
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

          {/* Search by 10-Digit Mobile Number / Name Filter */}
          <div className="space-y-1.5 shrink-0">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-emerald-600" />
              </div>
              <input
                type="text"
                inputMode={/^\d*$/.test(searchQuery) ? 'numeric' : 'text'}
                maxLength={/^\d+$/.test(searchQuery.trim()) ? 10 : 50}
                placeholder="Search by 10-Digit Mobile # (e.g. 98...) or Name..."
                value={searchQuery}
                onChange={e => {
                  const val = e.target.value;
                  if (/^\d+$/.test(val.trim())) {
                    setSearchQuery(val.replace(/\D/g, '').slice(0, 10));
                  } else {
                    setSearchQuery(val);
                  }
                }}
                className={`w-full pl-9 pr-9 py-2 bg-slate-50 hover:bg-white focus:bg-white border rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 transition shadow-inner font-mono ${
                  searchValidation?.type === 'PHONE' && !searchValidation.isValid
                    ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20'
                    : searchValidation?.type === 'PHONE' && searchValidation.isValid
                      ? 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-500/20 bg-emerald-50/20'
                      : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                }`}
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

            {/* Real-time 10-digit validation status badge */}
            {searchValidation && (
              <div className="px-1 text-[10px] font-bold flex items-center justify-between">
                {searchValidation.type === 'PHONE' ? (
                  searchValidation.status === 'INVALID_START' ? (
                    <span className="text-red-600 flex items-center gap-1">
                      ❌ {searchValidation.message}
                    </span>
                  ) : searchValidation.status === 'INCOMPLETE' ? (
                    <span className="text-amber-700 flex items-center gap-1">
                      📱 10-Digit Mobile Required: {searchValidation.message}
                    </span>
                  ) : (
                    <span className="text-emerald-700 flex items-center gap-1">
                      ✓ 10-Digit Mobile Verified: {filteredPasses.length} Pass(es) Found
                    </span>
                  )
                ) : (
                  <span className="text-slate-500 flex items-center gap-1">
                    🔍 {searchValidation.message} ({filteredPasses.length} found)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Dynamic Height Scrollable Box: Seamlessly fills remaining height with zero gap */}
          <div className="flex-1 min-h-[280px] max-h-[460px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {filteredPasses.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-200 shadow-2xs">
                  <Phone className="w-6 h-6 opacity-60" />
                </div>
                <p className="text-xs text-slate-700 font-bold max-w-xs">
                  {searchValidation?.type === 'PHONE' && searchValidation.status === 'VALID'
                    ? `No pass registered with 10-digit mobile "${searchQuery}"`
                    : searchQuery
                      ? `No pass found matching "${searchQuery}"`
                      : 'No subscription passes issued yet today.'}
                </p>
                {searchValidation?.type === 'PHONE' && searchValidation.status === 'INCOMPLETE' && (
                  <p className="text-[11px] text-amber-700 font-bold max-w-xs">
                    Please enter full 10 digits to search by mobile number.
                  </p>
                )}
                {searchQuery && searchValidation?.status !== 'INCOMPLETE' && (
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
