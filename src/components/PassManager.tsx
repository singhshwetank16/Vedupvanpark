import React, { useState, useEffect, useMemo } from 'react';
import type { Pass, AppConfig, PaymentMethod, PassMember, MaritalStatus } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { biometricService } from '../lib/biometric';
import { CameraModal } from './CameraModal';
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
  AlertTriangle,
  Clock,
  Camera,
  Fingerprint,
  Users,
  Heart,
  Baby,
  Save,
  Check,
  AlertCircle
} from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

interface PassManagerProps {
  config: AppConfig;
  onTicketGenerated: (pass: Pass) => void;
}

interface EditableMemberState {
  id: string;
  full_name: string;
  relationship: string;
  is_primary_holder: boolean;
  photo_url?: string;
  biometric_template?: string;
  biometric_quality?: number;
  biometric_device?: string;
  consent_recorded?: boolean;
  guardian_consent_name?: string;
}

export const PassManager: React.FC<PassManagerProps> = ({ config, onTicketGenerated }) => {
  const [passType, setPassType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [holderName, setHolderName] = useState('');
  const [holderPhone, setHolderPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [validityDays, setValidityDays] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [recentPasses, setRecentPasses] = useState<Pass[]>([]);
  const [pricingRates, setPricingRates] = useState(() => dbService.getPricingRates());

  // Family details & counts
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>('UNMARRIED');
  const [familySize, setFamilySize] = useState<number>(1);
  const [childrenCount, setChildrenCount] = useState<number>(0);
  const [coveredMembersCount, setCoveredMembersCount] = useState<number>(1);

  // Dynamic covered members state (1 to N)
  const [members, setMembers] = useState<EditableMemberState[]>([
    {
      id: 'mem-primary',
      full_name: '',
      relationship: 'SELF',
      is_primary_holder: true,
      consent_recorded: true,
    },
  ]);

  // Modal controls for Camera & Biometric
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [activeCameraMemberIdx, setActiveCameraMemberIdx] = useState<number>(0);
  const [biometricScanningIdx, setBiometricScanningIdx] = useState<number | null>(null);
  const [biometricError, setBiometricError] = useState<{ idx: number; message: string } | null>(null);

  // Search filter for re-printing passes by Mobile number or Name
  const [searchQuery, setSearchQuery] = useState('');
  const [cloudSearchResults, setCloudSearchResults] = useState<Pass[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Active pass duplicate check for entered mobile number
  const [existingActivePass, setExistingActivePass] = useState<Pass | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);

  // Enrollment Drawer / Modal for existing / draft passes
  const [selectedPassForEnrollment, setSelectedPassForEnrollment] = useState<Pass | null>(null);
  const [enrollmentDrawerMembers, setEnrollmentDrawerMembers] = useState<EditableMemberState[]>([]);
  const [isUpdatingEnrollment, setIsUpdatingEnrollment] = useState(false);

  // Dynamic base rate calculation
  const baseRateInr = useMemo(() => {
    if (passType === 'YEARLY') {
      return pricingRates.yearly_pass_inr;
    }
    if (validityDays === 60) return pricingRates.monthly_pass_2m_inr;
    if (validityDays === 90) return pricingRates.monthly_pass_3m_inr;
    return pricingRates.monthly_pass_1m_inr;
  }, [passType, validityDays, pricingRates]);

  const totalAmountInr = baseRateInr;

  const estimatedValidThrough = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (validityDays || 30));
    return d.toISOString().split('T')[0];
  }, [validityDays]);

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

  // Sync primary holder name with holderName field
  useEffect(() => {
    setMembers(prev => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      copy[0] = {
        ...copy[0],
        full_name: holderName.trim(),
        relationship: 'SELF',
        is_primary_holder: true,
      };
      return copy;
    });
  }, [holderName]);

  // Adjust covered members array whenever coveredMembersCount changes
  useEffect(() => {
    const count = Math.max(1, coveredMembersCount);
    setMembers(prev => {
      const next: EditableMemberState[] = [];
      for (let i = 0; i < count; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          let defaultRelation = 'SPOUSE';
          if (maritalStatus === 'UNMARRIED') defaultRelation = 'OTHER';
          else if (i === 1) defaultRelation = 'SPOUSE';
          else if (i >= 2 && childrenCount > 0) defaultRelation = 'SON';

          next.push({
            id: `mem-${Date.now()}-${i}`,
            full_name: '',
            relationship: defaultRelation,
            is_primary_holder: false,
            consent_recorded: true,
            guardian_consent_name: holderName || 'Primary Holder',
          });
        }
      }
      return next;
    });
  }, [coveredMembersCount, maritalStatus]);

  // Family count change handlers
  const handleFamilySizeChange = (val: number) => {
    const valid = Math.max(1, Math.min(25, val));
    setFamilySize(valid);
    if (coveredMembersCount > valid) {
      setCoveredMembersCount(valid);
    }
    if (childrenCount > valid) {
      setChildrenCount(valid);
    }
  };

  const handleChildrenCountChange = (val: number) => {
    const valid = Math.max(0, Math.min(familySize, val));
    setChildrenCount(valid);
  };

  const handleCoveredMembersCountChange = (val: number) => {
    const valid = Math.max(1, Math.min(familySize, val));
    setCoveredMembersCount(valid);
  };

  // Update a single member's fields
  const updateMember = (index: number, fields: Partial<EditableMemberState>) => {
    setMembers(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], ...fields };
      }
      return copy;
    });
  };

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

  // Check enrollment completion for all covered members
  const memberValidation = useMemo(() => {
    const pendingItems: string[] = [];
    let completeCount = 0;

    members.forEach((m, idx) => {
      const label = idx === 0 ? `Primary Holder (${m.full_name || 'Name Required'})` : `Member ${idx + 1} (${m.full_name || 'Name Required'})`;
      const isNameMissing = !m.full_name || !m.full_name.trim();
      const isPhotoMissing = !m.photo_url;
      const isBioMissing = !m.biometric_template;

      if (isNameMissing) pendingItems.push(`${label}: Full Name missing`);
      if (isPhotoMissing) pendingItems.push(`${label}: Live Photo pending`);
      if (isBioMissing) pendingItems.push(`${label}: Biometric fingerprint pending`);

      if (!isNameMissing && !isPhotoMissing && !isBioMissing) {
        completeCount++;
      }
    });

    const isAllComplete = completeCount === coveredMembersCount && pendingItems.length === 0;

    return {
      isAllComplete,
      completeCount,
      totalRequired: coveredMembersCount,
      pendingItems,
    };
  }, [members, coveredMembersCount]);

  // Live Camera Photo Trigger
  const handleOpenPhotoCapture = (memberIdx: number) => {
    setActiveCameraMemberIdx(memberIdx);
    setCameraModalOpen(true);
  };

  const handlePhotoCaptured = (photoDataUrl: string) => {
    if (selectedPassForEnrollment) {
      // Update enrollment drawer member
      setEnrollmentDrawerMembers(prev => {
        const copy = [...prev];
        if (copy[activeCameraMemberIdx]) {
          copy[activeCameraMemberIdx] = {
            ...copy[activeCameraMemberIdx],
            photo_url: photoDataUrl,
          };
        }
        return copy;
      });
    } else {
      updateMember(activeCameraMemberIdx, { photo_url: photoDataUrl });
    }
    setCameraModalOpen(false);
  };

  // Live Biometric Scan Trigger
  const handleScanBiometric = async (memberIdx: number, isDrawer = false) => {
    const targetMember = isDrawer ? enrollmentDrawerMembers[memberIdx] : members[memberIdx];
    if (!targetMember) return;

    setBiometricScanningIdx(memberIdx);
    setBiometricError(null);

    try {
      const identifier = targetMember.full_name || `mem-${memberIdx + 1}`;
      const result = await biometricService.captureBiometric(identifier);

      if (result.success && result.templateData) {
        if (isDrawer) {
          setEnrollmentDrawerMembers(prev => {
            const copy = [...prev];
            if (copy[memberIdx]) {
              copy[memberIdx] = {
                ...copy[memberIdx],
                biometric_template: result.templateData,
                biometric_quality: result.qualityScore,
                biometric_device: result.deviceModel,
              };
            }
            return copy;
          });
        } else {
          updateMember(memberIdx, {
            biometric_template: result.templateData,
            biometric_quality: result.qualityScore,
            biometric_device: result.deviceModel,
          });
        }
      } else {
        setBiometricError({
          idx: memberIdx,
          message: result.errorMessage || 'Biometric capture failed. Please ensure scanner is connected.',
        });
      }
    } catch (err: unknown) {
      setBiometricError({
        idx: memberIdx,
        message: err instanceof Error ? err.message : 'Scanner device error. Check RD Service.',
      });
    } finally {
      setBiometricScanningIdx(null);
    }
  };

  // Save Pass as Draft
  const handleSaveDraft = async () => {
    if (!holderName.trim()) {
      alert('Please enter Pass Holder Name to save draft.');
      return;
    }
    const cleanDigits = holderPhone.replace(/\D/g, '').slice(-10);
    if (!cleanDigits || cleanDigits.length !== 10) {
      alert('Please enter a valid 10-digit mobile number before saving draft.');
      return;
    }

    setIsSavingDraft(true);
    try {
      const draftPass = await dbService.savePassDraft({
        pass_type: passType,
        holder_name: holderName.trim(),
        holder_phone: cleanDigits,
        people_allowed: coveredMembersCount,
        payment_method: paymentMode,
        duration_days: validityDays,
        price_paise: totalAmountInr * 100,
        marital_status: maritalStatus,
        family_size: familySize,
        children_count: childrenCount,
        covered_members_count: coveredMembersCount,
        members: members.map(m => ({
          id: m.id,
          full_name: m.full_name.trim() || 'Pending Name',
          relationship: m.relationship,
          is_primary_holder: m.is_primary_holder,
          photo_url: m.photo_url,
          biometric_template: m.biometric_template,
          biometric_quality: m.biometric_quality,
          status: m.photo_url && m.biometric_template ? 'ACTIVE' : 'PENDING',
          consent_recorded: m.consent_recorded,
          guardian_consent_name: m.guardian_consent_name,
        })),
      });

      await loadPasses();
      alert(`Pass saved as DRAFT (${draftPass.pass_number})! You can complete photos & biometrics later to activate it.`);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save draft pass.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Final Issue & Activate Pass
  const handleGeneratePass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!holderName.trim()) {
      alert('Please enter Pass Holder Name.');
      return;
    }

    const cleanDigits = holderPhone.replace(/\D/g, '').slice(-10);
    if (!cleanDigits || cleanDigits.length !== 10) {
      alert('Invalid Mobile Number! Exactly 10 digits are required.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanDigits)) {
      alert('Invalid Mobile Number! Mobile numbers in India must start with 6, 7, 8, or 9.');
      return;
    }

    const activePass = await dbService.checkActivePassByPhone(cleanDigits);
    if (activePass) {
      setExistingActivePass(activePass);
      alert(
        `Active pass (${activePass.pass_number}) already exists for mobile ${cleanDigits} valid until ${activePass.valid_through}!\n\nNew pass cannot be issued until current pass expires.`
      );
      return;
    }

    if (!memberValidation.isAllComplete) {
      alert(
        `Biometric & Photo Enrollment incomplete!\n\n${memberValidation.pendingItems.slice(0, 5).join('\n')}\n\nAll ${coveredMembersCount} covered member(s) must have both Live Photo and Fingerprint Enrolled before pass can be activated. You can use "Save as Draft" if enrollment is in progress.`
      );
      return;
    }

    setIsGenerating(true);
    try {
      const pass = await dbService.issuePass({
        pass_type: passType,
        holder_name: holderName.trim(),
        holder_phone: cleanDigits,
        people_allowed: coveredMembersCount,
        payment_method: paymentMode,
        duration_days: validityDays,
        price_paise: totalAmountInr * 100,
        marital_status: maritalStatus,
        family_size: familySize,
        children_count: childrenCount,
        covered_members_count: coveredMembersCount,
        enrollment_status: 'ACTIVE',
        members: members.map(m => ({
          id: m.id,
          full_name: m.full_name.trim(),
          relationship: m.relationship,
          is_primary_holder: m.is_primary_holder,
          photo_url: m.photo_url,
          biometric_template: m.biometric_template,
          biometric_quality: m.biometric_quality,
          status: 'ACTIVE',
          consent_recorded: m.consent_recorded,
          guardian_consent_name: m.guardian_consent_name,
        })),
      });

      onTicketGenerated(pass);
      loadPasses();

      // Trigger Print without re-triggering biometric
      if (printerService.isConnected) {
        await printerService.printViaBluetooth(pass, config);
      } else {
        setTimeout(() => {
          printerService.printViaBrowser();
        }, 100);
      }

      // Reset form
      setHolderName('');
      setHolderPhone('');
      setFamilySize(1);
      setChildrenCount(0);
      setCoveredMembersCount(1);
      setExistingActivePass(null);
      setMembers([
        {
          id: 'mem-primary',
          full_name: '',
          relationship: 'SELF',
          is_primary_holder: true,
          consent_recorded: true,
        },
      ]);

      const durationLabel = passType === 'MONTHLY'
        ? (validityDays === 30 ? '1 Month (₹300)' : validityDays === 60 ? '2 Months (₹600)' : '3 Months (₹900)')
        : '1 Year (₹3,100)';
      alert(`Success! ${passType === 'MONTHLY' ? 'Monthly Pass' : 'Yearly Pass'} [${durationLabel}] issued with ${coveredMembersCount} biometric enrolled member(s). Sent to printer.`);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to issue pass. Please check your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Re-print existing pass (strictly no biometric re-trigger)
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

  // Open Enrollment for Existing / Draft Pass
  const handleOpenEnrollmentDrawer = async (pass: Pass) => {
    setSelectedPassForEnrollment(pass);
    const existingMembers = dbService.getLocalPassMembers(pass.id);

    if (existingMembers && existingMembers.length > 0) {
      setEnrollmentDrawerMembers(
        existingMembers.map(m => ({
          id: m.id,
          full_name: m.full_name,
          relationship: m.relationship,
          is_primary_holder: m.is_primary_holder,
          photo_url: m.photo_url,
          biometric_template: m.biometric_template,
          biometric_quality: m.biometric_quality,
          consent_recorded: m.consent_recorded !== false,
          guardian_consent_name: m.guardian_consent_name,
        }))
      );
    } else {
      // Default to 1 member using pass holder info
      setEnrollmentDrawerMembers([
        {
          id: `mem-${pass.id}-0`,
          full_name: pass.holder_name,
          relationship: 'SELF',
          is_primary_holder: true,
          photo_url: pass.photo_url,
          consent_recorded: true,
        },
      ]);
    }
  };

  // Submit enrollment update for existing pass
  const handleSaveEnrollmentDrawer = async () => {
    if (!selectedPassForEnrollment) return;
    setIsUpdatingEnrollment(true);
    try {
      const formattedMembers: PassMember[] = enrollmentDrawerMembers.map(m => ({
        id: m.id,
        pass_id: selectedPassForEnrollment.id,
        full_name: m.full_name.trim() || selectedPassForEnrollment.holder_name,
        relationship: m.relationship,
        is_primary_holder: m.is_primary_holder,
        photo_url: m.photo_url,
        status: m.photo_url && m.biometric_template ? 'ACTIVE' : 'PENDING',
        enabled: true,
        biometric_template: m.biometric_template,
        biometric_quality: m.biometric_quality,
        consent_recorded: m.consent_recorded,
        guardian_consent_name: m.guardian_consent_name,
      }));

      const res = await dbService.updatePassEnrollment(selectedPassForEnrollment.id, formattedMembers);
      if (res.success) {
        alert(res.message || 'Pass enrollment updated successfully!');
        setSelectedPassForEnrollment(null);
        await loadPasses();
      } else {
        alert(res.message || 'Failed to update enrollment.');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error updating enrollment');
    } finally {
      setIsUpdatingEnrollment(false);
    }
  };

  return (
    <div className="max-w-[1440px] xl:max-w-[1560px] mx-auto w-full px-2 sm:px-4 py-1 space-y-2.5">
      {/* Compact Title Header with Logo & Mode Switcher */}
      <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 shadow-md shadow-emerald-950/10 backdrop-blur-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative group shrink-0">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Logo"
              className="relative w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-xl border border-white/80 p-0.5 bg-white shadow-xs"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base lg:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
                Subscription Passes Desk
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Biometric Secured
              </span>
            </div>
            <p className="text-slate-500 text-[10px] sm:text-[11px] font-medium truncate">
              Monthly & Yearly passes with family member photo capture & biometric 1:1 gate verification.
            </p>
          </div>
        </div>

        {/* Pass Type Switcher Tabs */}
        <div className="w-full md:w-auto grid grid-cols-2 bg-slate-100/90 backdrop-blur-md p-1 rounded-xl border border-slate-200/80 shadow-2xs gap-1 shrink-0">
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

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start">
        {/* Pass Issuance Form (Left Column) */}
        <div className="lg:col-span-7 bg-gradient-to-br from-white via-white to-emerald-50/30 border border-white/70 rounded-2xl p-3.5 sm:p-4 shadow-lg shadow-emerald-950/15 backdrop-blur-xl">
          <form onSubmit={handleGeneratePass} className="space-y-3.5">
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

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-bold">
                  Exp: {estimatedValidThrough}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  passType === 'YEARLY'
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {passType}
                </span>
              </div>
            </div>

            {/* Holder Full Name & Phone side-by-side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-700 font-black mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-600" />
                  <span>Primary Pass Holder Name *</span>
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
                    <span>Mobile Number *</span>
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

                {/* Validation helper */}
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

            {/* Family Details & Covered Members Configuration */}
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Family & Covered Members Setup
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Step 1: Configure Counts
                </span>
              </div>

              {/* 4 Fields Grid: Marital Status, Family Size, Children Count, Covered Members */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Marital Status */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-600 font-black mb-1 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-rose-500" />
                    <span>Marital Status</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMaritalStatus('UNMARRIED')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition cursor-pointer text-center ${
                        maritalStatus === 'UNMARRIED'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Single
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaritalStatus('MARRIED')}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition cursor-pointer text-center ${
                        maritalStatus === 'MARRIED'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Married
                    </button>
                  </div>
                </div>

                {/* 2. No. of Persons in Family */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-600 font-black mb-1 flex items-center justify-between">
                    <span>Family Size (Total) *</span>
                    <span className="text-[9px] text-slate-400 font-mono">incl. holder</span>
                  </label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={1}
                      max={25}
                      required
                      value={familySize}
                      onChange={e => handleFamilySizeChange(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-black text-center text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>
                </div>

                {/* 3. No. of Children */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-600 font-black mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-0.5">
                      <Baby className="w-3 h-3 text-amber-500" />
                      <span>Children Count</span>
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">in family</span>
                  </label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={0}
                      max={familySize}
                      value={childrenCount}
                      onChange={e => handleChildrenCountChange(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-900 font-black text-center text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    />
                  </div>
                </div>

                {/* 4. Members to Include in this Pass */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-emerald-800 font-black mb-1 flex items-center justify-between">
                    <span>Pass Members *</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-900 px-1 rounded font-bold">Enrolling</span>
                  </label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={1}
                      max={familySize}
                      required
                      value={coveredMembersCount}
                      onChange={e => handleCoveredMembersCountChange(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2.5 py-1.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl text-emerald-950 font-black text-center text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Informational Hint */}
              <div className="flex items-center justify-between text-[10px] text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                <span>
                  Family has <strong>{familySize}</strong> member(s) ({childrenCount} children). Pass covers <strong>{coveredMembersCount}</strong> member(s).
                </span>
                <span className="font-bold text-emerald-700">
                  {coveredMembersCount} Section(s) Below
                </span>
              </div>
            </div>

            {/* Individual Covered Members Enrollment Cards (1 to N) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wide">
                    Covered Members Live Enrollment ({coveredMembersCount})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    memberValidation.isAllComplete
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {memberValidation.completeCount}/{memberValidation.totalRequired} Ready
                  </span>
                </div>
              </div>

              {/* Render dynamic member cards */}
              <div className="space-y-2">
                {members.map((m, idx) => {
                  const isPrimary = idx === 0;
                  const isScanning = biometricScanningIdx === idx;
                  const hasPhoto = !!m.photo_url;
                  const hasBiometric = !!m.biometric_template;
                  const isMemberComplete = (isPrimary ? !!holderName.trim() : !!m.full_name.trim()) && hasPhoto && hasBiometric;

                  return (
                    <div
                      key={m.id || idx}
                      className={`rounded-2xl border p-3 transition-all ${
                        isMemberComplete
                          ? 'bg-white/95 border-emerald-300/80 shadow-xs ring-1 ring-emerald-200'
                          : 'bg-white border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                        {/* Member Identity & Name */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {/* Photo Avatar / Capture Button */}
                          <div className="relative shrink-0">
                            {hasPhoto ? (
                              <div className="relative group">
                                <img
                                  src={m.photo_url}
                                  alt={m.full_name || 'Member'}
                                  className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-500 shadow-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleOpenPhotoCapture(idx)}
                                  className="absolute inset-0 bg-black/50 text-white rounded-xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[9px] font-bold cursor-pointer"
                                  title="Retake live photo"
                                >
                                  Retake
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenPhotoCapture(idx)}
                                className="w-12 h-12 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100/80 text-amber-800 transition flex flex-col items-center justify-center gap-0.5 cursor-pointer shadow-2xs group"
                                title="Click to capture live photo"
                              >
                                <Camera className="w-4 h-4 text-amber-700 group-hover:scale-110 transition" />
                                <span className="text-[8px] font-extrabold uppercase">Photo</span>
                              </button>
                            )}
                          </div>

                          {/* Member Inputs */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                                isPrimary
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-800 border border-slate-300'
                              }`}>
                                {isPrimary ? '1. Primary Holder' : `${idx + 1}. Member`}
                              </span>

                              {isPrimary ? (
                                <span className="text-[10px] font-black text-slate-800 truncate">
                                  {holderName || 'Enter name above'}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  required
                                  placeholder="Full Name"
                                  value={m.full_name}
                                  onChange={e => updateMember(idx, { full_name: e.target.value })}
                                  className="text-xs font-bold text-slate-900 border-b border-slate-300 focus:border-emerald-500 focus:outline-none px-1 py-0.5 w-full max-w-[200px]"
                                />
                              )}
                            </div>

                            {/* Relationship & Consent */}
                            <div className="flex items-center gap-2">
                              {isPrimary ? (
                                <span className="text-[10px] text-slate-500 font-bold">Relationship: Self</span>
                              ) : (
                                <select
                                  value={m.relationship}
                                  onChange={e => updateMember(idx, { relationship: e.target.value })}
                                  className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="SPOUSE">Spouse</option>
                                  <option value="SON">Son (Child)</option>
                                  <option value="DAUGHTER">Daughter (Child)</option>
                                  <option value="FATHER">Father</option>
                                  <option value="MOTHER">Mother</option>
                                  <option value="BROTHER">Brother</option>
                                  <option value="SISTER">Sister</option>
                                  <option value="OTHER">Other Relation</option>
                                </select>
                              )}

                              {(m.relationship === 'SON' || m.relationship === 'DAUGHTER') && (
                                <label className="text-[9px] text-slate-600 flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={m.consent_recorded !== false}
                                    onChange={e => updateMember(idx, { consent_recorded: e.target.checked })}
                                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3 h-3"
                                  />
                                  <span>Guardian Consent</span>
                                </label>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Biometric Trigger */}
                        <div className="flex items-center gap-2 shrink-0 justify-end">
                          {/* Photo Status */}
                          <div className="flex flex-col items-center">
                            {hasPhoto ? (
                              <button
                                type="button"
                                onClick={() => handleOpenPhotoCapture(idx)}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              >
                                <Check className="w-3 h-3 text-emerald-600" /> Photo Done
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenPhotoCapture(idx)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              >
                                <Camera className="w-3 h-3 text-amber-600" /> Take Photo *
                              </button>
                            )}
                          </div>

                          {/* Biometric Status & Button */}
                          <div className="flex flex-col items-center">
                            {hasBiometric ? (
                              <button
                                type="button"
                                onClick={() => handleScanBiometric(idx)}
                                disabled={isScanning}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                                title="Re-scan Fingerprint"
                              >
                                <Fingerprint className="w-3.5 h-3.5" />
                                <span>Enrolled ({m.biometric_quality || 85}%)</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleScanBiometric(idx)}
                                disabled={isScanning}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 cursor-pointer transition shadow-xs animate-pulse ring-1 ring-amber-400"
                              >
                                {isScanning ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Scanning...</span>
                                  </>
                                ) : (
                                  <>
                                    <Fingerprint className="w-3.5 h-3.5" />
                                    <span>Scan Fingerprint *</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Error Alert for affected member only */}
                      {biometricError && biometricError.idx === idx && (
                        <div className="mt-1.5 p-1.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            {biometricError.message}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleScanBiometric(idx)}
                            className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[9px] font-bold cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Validity Duration */}
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
                        className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                            : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {plan.label}
                        </div>
                        <div className={`text-[11px] font-black mt-0.5 ${
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
                  className={`py-2.5 sm:py-3 px-3 rounded-xl font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMode === 'CASH'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <Banknote className="w-4 h-4 shrink-0" />
                  <span>1. Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-2.5 sm:py-3 px-3 rounded-xl font-black text-xs sm:text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMode === 'UPI'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-md shadow-blue-600/30 ring-2 ring-blue-400'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                  }`}
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>2. UPI</span>
                </button>
              </div>
            </div>

            {/* Pass Rules Strip */}
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>2 Visits / Day • 10-Min Scan Cooldown</span>
              </div>
              <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                {coveredMembersCount} Covered Member{coveredMembersCount > 1 ? 's' : ''} (Individual Biometric)
              </span>
            </div>

            {/* Action Buttons: Save Draft & Issue/Print Pass */}
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 p-3 sm:p-3.5 rounded-2xl shadow-lg border border-emerald-600/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-emerald-200 font-extrabold">Total Fee</div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                  ₹{totalAmountInr.toFixed(2)}
                </div>
                <div className="text-[10px] sm:text-[11px] text-emerald-100 font-medium truncate">
                  Valid Through: <strong className="font-mono text-white">{estimatedValidThrough}</strong>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Save Draft Button */}
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isGenerating || !phoneValidation.isValid}
                  className="px-3.5 py-2.5 bg-emerald-900/60 hover:bg-emerald-900/90 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border border-emerald-400/40 cursor-pointer transition disabled:opacity-50"
                  title="Save pass as draft and complete biometrics later"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
                </button>

                {/* Final Issue & Activate Pass Button */}
                <button
                  type="submit"
                  disabled={isGenerating || !phoneValidation.isValid || existingActivePass !== null || !memberValidation.isAllComplete}
                  className={`px-5 sm:px-6 py-2.5 sm:py-3 font-black rounded-xl shadow-lg flex items-center justify-center gap-1.5 text-xs sm:text-sm transition cursor-pointer shrink-0 ${
                    memberValidation.isAllComplete && phoneValidation.isValid && !existingActivePass
                      ? 'bg-white hover:bg-emerald-50 active:scale-95 text-emerald-950 shadow-black/20'
                      : 'bg-emerald-900/40 text-emerald-200 border border-emerald-500/30 cursor-not-allowed opacity-75'
                  }`}
                >
                  <Printer className="w-4 h-4 text-emerald-700" />
                  <span>
                    {isGenerating
                      ? 'Activating...'
                      : existingActivePass
                        ? 'Active Pass Exists'
                        : !phoneValidation.isValid
                          ? 'Enter 10-Digit Mobile'
                          : !memberValidation.isAllComplete
                            ? `Enroll Photos & Biometrics (${memberValidation.completeCount}/${memberValidation.totalRequired})`
                            : 'Issue & Print Pass'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Active Passes List */}
        <div className="lg:col-span-5 bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-2xl p-3.5 sm:p-4 shadow-lg shadow-emerald-950/15 backdrop-blur-xl space-y-2.5">
          <div className="flex items-center justify-between border-b border-emerald-950/10 pb-2 shrink-0">
            <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Active Passes Issued</span>
              <button
                type="button"
                onClick={loadPasses}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition ml-1"
                title="Refresh passes"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
              {filteredPasses.length} Total
            </span>
          </div>

          {/* Search Box */}
          <div className="space-y-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by 10-Digit Mobile # (e.g. 98...) or Name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-12 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
                {isSearching && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                )}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {searchValidation && (
              <div className="text-[10px] px-1 font-bold">
                {searchValidation.isValid ? (
                  <span className="text-emerald-700">{searchValidation.message}</span>
                ) : (
                  <span className="text-amber-700">{searchValidation.message}</span>
                )}
              </div>
            )}
          </div>

          {/* Pass Cards List */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredPasses.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs font-medium">
                No subscription passes found.
              </div>
            ) : (
              filteredPasses.map(p => {
                const isDraftOrPending = p.enrollment_status === 'DRAFT' || p.enrollment_status === 'PENDING_ENROLLMENT';
                return (
                  <div
                    key={p.id}
                    className="p-2.5 bg-white border border-slate-200/90 rounded-xl hover:border-emerald-300 transition shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {p.pass_type}
                        </span>
                        {isDraftOrPending ? (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-0.5">
                            <AlertCircle className="w-2.5 h-2.5 text-amber-600" /> Enrollment Required
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5 text-emerald-700" /> Biometric Secured
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 font-bold">
                        {p.pass_number}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                          <User className="w-3 h-3 text-emerald-600" />
                          <span>{p.holder_name}</span>
                        </div>
                        {p.holder_phone && (
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-slate-400" />
                            <span>{p.holder_phone}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-emerald-900">
                          ₹{((p.amount_paise || 0) / 100).toFixed(2)}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          Valid: {p.valid_through}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons on pass card */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-bold">
                        {p.covered_members_count || p.people_allowed || 1} Covered Member(s)
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isDraftOrPending && (
                          <button
                            type="button"
                            onClick={() => handleOpenEnrollmentDrawer(p)}
                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-black flex items-center gap-1 cursor-pointer transition shadow-2xs"
                          >
                            <UserCheck className="w-2.5 h-2.5" /> Complete Enrollment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReprint(p)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[10px] font-black flex items-center gap-1 cursor-pointer transition shadow-2xs"
                        >
                          <Printer className="w-2.5 h-2.5 text-slate-600" /> Re-Print
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Live Camera Capture Modal */}
      <CameraModal
        isOpen={cameraModalOpen}
        title={
          selectedPassForEnrollment
            ? `Live Photo: ${enrollmentDrawerMembers[activeCameraMemberIdx]?.full_name || `Member ${activeCameraMemberIdx + 1}`}`
            : `Live Photo: ${members[activeCameraMemberIdx]?.full_name || (activeCameraMemberIdx === 0 ? holderName : `Member ${activeCameraMemberIdx + 1}`)}`
        }
        subtitle="Align face within oval frame & capture sharp photo"
        onCaptureConfirm={handlePhotoCaptured}
        onClose={() => setCameraModalOpen(false)}
      />

      {/* Enrollment Completion Modal for Draft or Legacy Passes */}
      {selectedPassForEnrollment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col space-y-3 p-4 sm:p-5 relative my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600" />
                  <span>Complete Pass Enrollment</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Pass <strong>{selectedPassForEnrollment.pass_number}</strong> • Holder:{' '}
                  <strong>{selectedPassForEnrollment.holder_name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPassForEnrollment(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of members to enroll */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {enrollmentDrawerMembers.map((m, idx) => {
                const isScanning = biometricScanningIdx === idx;
                return (
                  <div key={m.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                          {m.is_primary_holder ? 'Primary Holder' : `Member ${idx + 1}`}
                        </span>
                        <input
                          type="text"
                          value={m.full_name}
                          onChange={e => {
                            const val = e.target.value;
                            setEnrollmentDrawerMembers(prev => {
                              const copy = [...prev];
                              if (copy[idx]) copy[idx] = { ...copy[idx], full_name: val };
                              return copy;
                            });
                          }}
                          placeholder="Member Full Name"
                          className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2 py-1 rounded-lg"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">{m.relationship}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {/* Photo capture */}
                      <div>
                        {m.photo_url ? (
                          <div className="flex items-center gap-2">
                            <img src={m.photo_url} alt="Photo" className="w-10 h-10 rounded-lg object-cover border" />
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCameraMemberIdx(idx);
                                setCameraModalOpen(true);
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:underline"
                            >
                              Retake Photo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCameraMemberIdx(idx);
                              setCameraModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" /> Capture Live Photo
                          </button>
                        )}
                      </div>

                      {/* Biometric Scan */}
                      <div>
                        {m.biometric_template ? (
                          <button
                            type="button"
                            onClick={() => handleScanBiometric(idx, true)}
                            disabled={isScanning}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                          >
                            <Fingerprint className="w-3 h-3" /> Enrolled ({m.biometric_quality || 85}%)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleScanBiometric(idx, true)}
                            disabled={isScanning}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                          >
                            <Fingerprint className="w-3 h-3" /> {isScanning ? 'Scanning...' : 'Scan Fingerprint'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedPassForEnrollment(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEnrollmentDrawer}
                disabled={isUpdatingEnrollment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isUpdatingEnrollment ? 'Saving...' : 'Save & Activate Pass'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
