import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { dbService } from '../lib/supabase';
import { sounds } from '../lib/audio';
import { biometricService } from '../lib/biometric';
import { CameraModal } from './CameraModal';
import type { VerificationResponse, AppConfig, Pass, PassMember } from '../types';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Volume2,
  ShieldCheck,
  RefreshCw,
  Upload,
  Lock,
  QrCode,
  Clock,
  Phone,
  Search,
  Smartphone,
  Fingerprint,
  UserCheck,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

interface GateScannerProps {
  config: AppConfig;
}

// Clean helper to format date and time reliably into "DD-MMM-YYYY • HH:MM AM/PM"
export const formatCleanDateTime = (val?: string | null): string => {
  if (!val) return '—';
  const d = new Date(val);
  if (!isNaN(d.getTime()) && val.includes('-') && (val.includes('T') || val.length > 20)) {
    const day = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${day} • ${time}`;
  }
  let clean = val.replace(/:\d{2}\s+(AM|PM)/i, ' $1');
  clean = clean.replace(/,\s*/g, ' • ');
  return clean.trim();
};

// Clean helper to structure denial messages into 3 distinct lines
const parseDenialDetails = (result: VerificationResponse) => {
  const rawMsg = result.message || '';
  const upper = rawMsg.toUpperCase();

  if (result.code === 'USED' || upper.includes('ALREADY EXPIRED') || upper.includes('FIRST SCANNED AT')) {
    const match = rawMsg.match(/(?:first\s+)?scanned\s+at:\s*(.*)$/i);
    let timeText = match?.[1]?.trim() || result.scanned_at || '';
    timeText = timeText.replace(/[!.]+$/, '').trim();

    return {
      line1: 'Ticket Already Expired !',
      line2: 'First scanned at:',
      line3: timeText || 'Previously scanned',
    };
  }

  if (result.code === 'COOLDOWN' || upper.includes('COOLDOWN ACTIVE')) {
    const match = rawMsg.match(/last scanned:?\s*(.*)$/i);
    const timeText = match?.[1]?.trim() || result.scanned_at || '';
    return {
      line1: 'Cooldown Active !',
      line2: 'Last scanned at:',
      line3: timeText || 'Scanned recently (10-min cooldown)',
    };
  }

  if (result.code === 'EXPIRED') {
    return {
      line1: 'Ticket / Pass Expired !',
      line2: 'Expired on:',
      line3: result.valid_through || 'Past expiration date',
    };
  }

  if (result.code === 'BIOMETRIC_MISMATCH') {
    return {
      line1: 'Biometric Mismatch !',
      line2: 'Verification failed for:',
      line3: result.member_name ? `${result.member_name} (Fingerprint did not match)` : 'Selected pass member',
    };
  }

  if (result.code === 'ENROLLMENT_REQUIRED') {
    return {
      line1: 'Enrollment Required !',
      line2: 'Action Needed:',
      line3: 'Complete member photo & biometric registration at Pass Desk',
    };
  }

  return {
    line1: rawMsg || 'Entry Denied !',
    line2: null,
    line3: null,
  };
};

export const GateScanner: React.FC<GateScannerProps> = ({ config }) => {
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState(() => dbService.getTodayScanSummary());
  const [isScanLocked, setIsScanLocked] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [isPhoneValidating, setIsPhoneValidating] = useState<boolean>(false);

  // Pass Gate Verification Modal State (for Monthly / Yearly passes)
  const [activePassForGate, setActivePassForGate] = useState<Pass | null>(null);
  const [activePassMembers, setActivePassMembers] = useState<PassMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<PassMember | null>(null);
  const [freshGatePhoto, setFreshGatePhoto] = useState<string | null>(null);
  const [freshBiometricTemplate, setFreshBiometricTemplate] = useState<string | null>(null);
  const [freshBiometricQuality, setFreshBiometricQuality] = useState<number | null>(null);
  const [isCapturingGatePhoto, setIsCapturingGatePhoto] = useState<boolean>(false);
  const [isScanningGateBiometric, setIsScanningGateBiometric] = useState<boolean>(false);
  const [isVerifyingGateEntry, setIsVerifyingGateEntry] = useState<boolean>(false);
  const [gateMemberVerificationError, setGateMemberVerificationError] = useState<string | null>(null);
  const [admittedMemberNotice, setAdmittedMemberNotice] = useState<{ name: string; photo: string } | null>(null);

  const scanLockedRef = useRef<boolean>(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerId = 'qr-reader-container';

  // Guard against double initialization & unmount race conditions
  const isStartingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Hardware USB/Bluetooth Barcode Scanner buffer listener
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const refreshScanSummary = async () => {
    try {
      const summary = await dbService.fetchTodayScanSummary();
      setScanSummary(summary);
    } catch {
      setScanSummary(dbService.getTodayScanSummary());
    }
  };

  // Next Scan Handler: Instant unpause without needing page reload
  const handleNextScan = async () => {
    setVerificationResult(null);
    setActivePassForGate(null);
    setSelectedMember(null);
    setFreshGatePhoto(null);
    setFreshBiometricTemplate(null);
    setGateMemberVerificationError(null);
    setAdmittedMemberNotice(null);

    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        html5QrCodeRef.current.resume();
      } catch (e) {
        console.warn('Resume camera warning, restarting scanner:', e);
        await startScanner();
      }
    } else {
      await startScanner();
    }

    // Grace period so moving the old ticket away does not re-trigger scan
    setTimeout(() => {
      scanLockedRef.current = false;
      setIsScanLocked(false);
      setIsProcessing(false);
    }, 400);
  };

  // Dismiss card only
  const handleDismissCard = () => {
    setVerificationResult(null);
    setActivePassForGate(null);
    setSelectedMember(null);
    setFreshGatePhoto(null);
    setFreshBiometricTemplate(null);
    setGateMemberVerificationError(null);
    setAdmittedMemberNotice(null);
    scanLockedRef.current = false;
    setIsScanLocked(false);
    setIsProcessing(false);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.resume();
      }
    } catch {}
  };

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();
    refreshScanSummary();

    const summaryTimer = setInterval(refreshScanSummary, 3000);

    // Listen for hardware 2D barcode / QR scanner guns without needing an input box
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastKeyTimeRef.current > 100) {
        barcodeBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length > 5 && !scanLockedRef.current) {
          handleScannedCode(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMountedRef.current = false;
      clearInterval(summaryTimer);
      stopScanner();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const cleanupExtraVideos = () => {
    try {
      const container = document.getElementById(scannerContainerId);
      if (container) {
        const videos = container.querySelectorAll('video');
        if (videos.length > 1) {
          for (let i = 1; i < videos.length; i++) {
            videos[i].pause();
            (videos[i].srcObject as MediaStream | null)?.getTracks()?.forEach(t => t.stop());
            videos[i].remove();
          }
        }
      }
    } catch (e) {
      console.warn('cleanupExtraVideos warning:', e);
    }
  };

  const startScanner = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      setCameraError(null);
      await stopScanner();

      const container = document.getElementById(scannerContainerId);
      if (container) {
        container.innerHTML = '';
      }

      if (!isMountedRef.current) {
        isStartingRef.current = false;
        return;
      }

      const qrScanner = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = qrScanner;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrEdge = Math.max(180, Math.floor(minEdge * 0.72));
        return { width: qrEdge, height: qrEdge };
      };

      const qrConfig = {
        fps: 15,
        qrbox: qrboxFunction,
      };

      try {
        await qrScanner.start(
          { facingMode: 'environment' },
          qrConfig,
          (decodedText) => {
            if (scanLockedRef.current) return;
            handleScannedCode(decodedText);
          },
          () => {}
        );
        cleanupExtraVideos();
        if (isMountedRef.current) {
          setScannerActive(true);
        } else {
          await stopScanner();
        }
      } catch (backCamErr) {
        console.warn('Back camera not found or failed, falling back to front/webcam:', backCamErr);
        if (!isMountedRef.current) {
          isStartingRef.current = false;
          return;
        }
        await qrScanner.start(
          { facingMode: 'user' },
          qrConfig,
          (decodedText) => {
            if (scanLockedRef.current) return;
            handleScannedCode(decodedText);
          },
          () => {}
        );
        cleanupExtraVideos();
        if (isMountedRef.current) {
          setScannerActive(true);
        } else {
          await stopScanner();
        }
      }
    } catch (err: unknown) {
      console.error('All camera startup attempts failed:', err);
      if (isMountedRef.current) {
        setCameraError(
          err instanceof Error
            ? err.message
            : 'Camera permission denied or camera device not found. You can still scan via QR image upload below.'
        );
        setScannerActive(false);
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Error clearing scanner', e);
      }
      html5QrCodeRef.current = null;
    }
    const container = document.getElementById(scannerContainerId);
    if (container) {
      container.innerHTML = '';
    }
    setScannerActive(false);
  };

  // Main Scanned Code Handler
  const handleScannedCode = async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode || isProcessing || scanLockedRef.current) return;

    scanLockedRef.current = true;
    setIsScanLocked(true);
    setIsProcessing(true);

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn('Could not pause camera video:', e);
    }

    try {
      // 1. FAST PATH: Check if this is a Single Entry Ticket (starts with VUP-T)
      const isSingleTicket = cleanCode.startsWith('VUP-T') || cleanCode.includes('TICKET');
      if (isSingleTicket) {
        const response = await dbService.admitVisitor(cleanCode);
        setVerificationResult(response);
        refreshScanSummary();

        if (response.success) {
          sounds.playSuccess();
        } else {
          sounds.playError();
        }
        return;
      }

      // 2. PASS PATH: Look up Monthly / Yearly pass with family members
      const lookup = await dbService.lookupPassForGate(cleanCode);

      if (lookup.found && lookup.pass) {
        // A. Pass validity check
        if (!lookup.is_valid) {
          sounds.playError();
          setVerificationResult({
            success: false,
            code: 'EXPIRED',
            document_type: 'PASS',
            pass_number: lookup.pass.pass_number,
            holder_name: lookup.pass.holder_name,
            valid_through: lookup.pass.valid_through,
            message: lookup.message || `Pass validity expired on ${lookup.pass.valid_through}!`,
          });
          return;
        }

        // B. Enrollment Status Check
        if (lookup.pass.enrollment_status === 'PENDING_ENROLLMENT' || lookup.pass.enrollment_status === 'DRAFT') {
          sounds.playError();
          setVerificationResult({
            success: false,
            code: 'ENROLLMENT_REQUIRED',
            document_type: 'PASS',
            pass_number: lookup.pass.pass_number,
            holder_name: lookup.pass.holder_name,
            message: 'Biometric & photo enrollment is required for this pass before gate entry. Please register at Pass Desk.',
          });
          return;
        }

        // C. Pass is Valid -> Open Gate Member Selection Modal
        setActivePassForGate(lookup.pass);
        const membersList = lookup.members || [];
        setActivePassMembers(membersList);
        setSelectedMember(membersList[0] || null);
        setFreshGatePhoto(null);
        setFreshBiometricTemplate(null);
        setGateMemberVerificationError(null);
        setAdmittedMemberNotice(null);
        return;
      }

      // 3. Fallback: Standard admission check
      const response = await dbService.admitVisitor(cleanCode);
      setVerificationResult(response);
      refreshScanSummary();

      if (response.success) {
        sounds.playSuccess();
      } else {
        sounds.playError();
      }
    } catch (err: unknown) {
      console.error('Validation error:', err);
      sounds.playError();
      setVerificationResult({
        success: false,
        code: 'INVALID',
        message: 'FRAUD ALERT: Unrecognized or forged code / connection failure!',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(scannerContainerId);
        html5QrCodeRef.current = scanner;
      }
      const decodedText = await scanner.scanFile(file, false);
      handleScannedCode(decodedText);
    } catch (err) {
      console.warn('File QR scan failed:', err);
      alert('Could not detect genuine QR code in this image. Please make sure the QR is clear and well-lit.');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Phone validation for pass entry
  const handlePhoneValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || isPhoneValidating) return;

    setIsPhoneValidating(true);
    scanLockedRef.current = true;
    setIsScanLocked(true);

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (err) {
      console.warn('Camera pause error during phone validate:', err);
    }

    try {
      const lookup = await dbService.lookupPassForGate(cleanPhone);

      if (lookup.found && lookup.pass) {
        if (!lookup.is_valid) {
          sounds.playError();
          setVerificationResult({
            success: false,
            code: 'EXPIRED',
            document_type: 'PASS',
            pass_number: lookup.pass.pass_number,
            holder_name: lookup.pass.holder_name,
            valid_through: lookup.pass.valid_through,
            message: lookup.message || `Pass expired on ${lookup.pass.valid_through}!`,
          });
          return;
        }

        if (lookup.pass.enrollment_status === 'PENDING_ENROLLMENT' || lookup.pass.enrollment_status === 'DRAFT') {
          sounds.playError();
          setVerificationResult({
            success: false,
            code: 'ENROLLMENT_REQUIRED',
            document_type: 'PASS',
            pass_number: lookup.pass.pass_number,
            holder_name: lookup.pass.holder_name,
            message: 'Biometric & photo enrollment is required for this pass before gate entry.',
          });
          return;
        }

        setActivePassForGate(lookup.pass);
        const membersList = lookup.members || [];
        setActivePassMembers(membersList);
        setSelectedMember(membersList[0] || null);
        setFreshGatePhoto(null);
        setFreshBiometricTemplate(null);
        setGateMemberVerificationError(null);
        setAdmittedMemberNotice(null);
        setPhoneInput('');
        return;
      }

      // Fallback
      const response = await dbService.admitPassByPhone(cleanPhone);
      setVerificationResult(response);
      refreshScanSummary();

      if (response.success) {
        sounds.playSuccess();
        setPhoneInput('');
      } else {
        sounds.playError();
      }
    } catch (err: unknown) {
      console.error('Phone pass validation error:', err);
      sounds.playError();
      setVerificationResult({
        success: false,
        code: 'INVALID',
        document_type: 'PASS',
        message: `Failed to validate pass for mobile number ${cleanPhone}. Please verify connection.`,
      });
    } finally {
      setIsPhoneValidating(false);
    }
  };

  // Biometric Scan for Member at Gate
  const handleScanGateBiometric = async () => {
    if (!selectedMember) return;
    setIsScanningGateBiometric(true);
    setGateMemberVerificationError(null);

    try {
      const result = await biometricService.captureBiometric(selectedMember.full_name);
      if (result.success && result.templateData) {
        setFreshBiometricTemplate(result.templateData);
        setFreshBiometricQuality(result.qualityScore);
      } else {
        setGateMemberVerificationError(result.errorMessage || 'Biometric scan failed. Place finger firmly on scanner.');
      }
    } catch (e: unknown) {
      setGateMemberVerificationError(e instanceof Error ? e.message : 'Scanner device error');
    } finally {
      setIsScanningGateBiometric(false);
    }
  };

  // Final Gate Entry Verification: Fresh Photo + Biometric 1:1 Match
  const handleVerifyGateMemberEntry = async () => {
    if (!activePassForGate || !selectedMember) return;

    if (!freshGatePhoto) {
      setGateMemberVerificationError('Live gate camera photo is mandatory before admission!');
      return;
    }
    if (!freshBiometricTemplate) {
      setGateMemberVerificationError('Live fingerprint scan is mandatory before admission!');
      return;
    }

    setIsVerifyingGateEntry(true);
    setGateMemberVerificationError(null);

    try {
      const response = await dbService.verifyMemberGateEntry({
        passId: activePassForGate.id,
        memberId: selectedMember.id,
        entryPhoto: freshGatePhoto,
        biometricSample: freshBiometricTemplate,
        gateCode: config.gate_code,
      });

      if (response.success) {
        sounds.playSuccess();
        refreshScanSummary();

        // Show admission confirmation
        setAdmittedMemberNotice({
          name: response.member_name || selectedMember.full_name,
          photo: freshGatePhoto,
        });

        // Set global verification result
        setVerificationResult(response);

        // Reset fresh capture for next person in line
        setFreshGatePhoto(null);
        setFreshBiometricTemplate(null);
        setFreshBiometricQuality(null);
      } else {
        sounds.playError();
        setGateMemberVerificationError(response.message || 'Biometric mismatch or admission denied.');
      }
    } catch (err: unknown) {
      sounds.playError();
      setGateMemberVerificationError(err instanceof Error ? err.message : 'Failed to verify member entry.');
    } finally {
      setIsVerifyingGateEntry(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-2.5 sm:p-4 space-y-4 sm:space-y-6">
      {/* Header Info Banner with Glassmorphism */}
      <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          <div className="relative group shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Logo"
              className="relative w-12 h-12 object-contain rounded-2xl border border-white/80 p-1 bg-white shadow-xs"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200/60 text-emerald-900 text-[10px] sm:text-xs font-black uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Gate Scanner • {config.gate_code}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              {config.park_settings.park_name}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">{config.park_settings.organization_name}</p>
          </div>
        </div>

        <div className="bg-slate-100/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/80 text-xs font-black text-slate-700 flex items-center gap-2 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Active Gate: <strong className="text-emerald-800">{config.gate_name}</strong></span>
        </div>
      </div>

      {/* Main Verification Result Card (Dynamic Success/Denial) */}
      {verificationResult && (
        <div
          className={`p-5 sm:p-7 rounded-3xl border-2 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 space-y-4 ${
            verificationResult.success
              ? 'bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-700 text-white border-emerald-400/80 shadow-emerald-900/40 ring-4 ring-emerald-500/20'
              : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white border-red-400/80 shadow-red-900/40 ring-4 ring-red-500/20'
          }`}
        >
          {/* Card Top Control Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 backdrop-blur-md border border-white/30">
              {verificationResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>ENTRY ALLOWED</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-100" />
                  <span>ENTRY DENIED</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleDismissCard}
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition shrink-0"
              title="Close card"
            >
              ✕ Close
            </button>
          </div>

          {/* SUCCESS VIEW */}
          {verificationResult.success ? (
            <div className="space-y-3.5">
              {/* Highlight Hero Card: Visitors Count */}
              <div className="bg-white text-emerald-950 rounded-2xl p-4 sm:p-5 shadow-xl border border-white/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
                      <Users className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700 leading-tight">
                        Allowed Visitor Entry
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-900 leading-none mt-1 whitespace-nowrap">
                        {verificationResult.persons_admitted || 1} {((verificationResult.persons_admitted || 1) > 1) ? 'PERSONS' : 'PERSON'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-xs font-black border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ADMITTED</span>
                    </div>
                  </div>
                </div>

                {/* Member / Pass Holder Details with Gate Photo */}
                {(verificationResult.member_name || verificationResult.holder_name) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {verificationResult.entry_photo_url && (
                        <img
                          src={verificationResult.entry_photo_url}
                          alt="Entry Photo"
                          className="w-10 h-10 rounded-xl object-cover border-2 border-emerald-500 shadow-xs"
                        />
                      )}
                      <div>
                        <div className="font-black text-slate-900">
                          {verificationResult.member_name || verificationResult.holder_name}
                        </div>
                        {verificationResult.biometric_verified && (
                          <div className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                            <Fingerprint className="w-3 h-3" />
                            <span>1:1 Biometric Verified (Match: {verificationResult.match_score || 88}%)</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {verificationResult.relationship && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {verificationResult.relationship}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Grid of Ticket / Pass Details */}
              <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-xs text-white space-y-2 shadow-inner">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/15">
                  <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Document Number:</span>
                  <span className="font-mono font-black text-white text-xs sm:text-sm tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {verificationResult.ticket_number || verificationResult.pass_number}
                  </span>
                </div>

                {verificationResult.pass_type && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Pass Type:</span>
                    <span className="font-bold text-white text-xs sm:text-sm truncate">
                      {verificationResult.pass_type} PASS
                    </span>
                  </div>
                )}

                {verificationResult.scanned_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Time Scanned:</span>
                    <span className="font-mono font-bold text-emerald-300 text-xs tracking-tight whitespace-nowrap">
                      {formatCleanDateTime(verificationResult.scanned_at)}
                    </span>
                  </div>
                )}

                {verificationResult.valid_through && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Valid Through:</span>
                    <span className="font-mono font-bold text-white text-xs">
                      {verificationResult.valid_through}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* DENIED / EXPIRED VIEW */
            (() => {
              const denial = parseDenialDetails(verificationResult);
              return (
                <div className="bg-white text-red-950 rounded-2xl p-5 shadow-xl border border-white/80 text-center space-y-2.5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-md shadow-red-600/30">
                    <XCircle className="w-9 h-9 stroke-[2.5]" />
                  </div>

                  <div className="text-lg sm:text-2xl font-black text-red-600 uppercase tracking-tight leading-tight">
                    {denial.line1}
                  </div>

                  {denial.line2 && (
                    <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600">
                      {denial.line2}
                    </div>
                  )}

                  {denial.line3 && (
                    <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs sm:text-sm font-black text-amber-300 shadow-inner max-w-full">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="whitespace-nowrap">{formatCleanDateTime(denial.line3)}</span>
                    </div>
                  )}

                  {(verificationResult.ticket_number || verificationResult.pass_number) && (
                    <div className="text-[11px] sm:text-xs text-slate-500 font-mono pt-1">
                      Doc #: <span className="font-bold text-slate-800 whitespace-nowrap">{verificationResult.ticket_number || verificationResult.pass_number}</span>
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {/* Action: Next Scan Button */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleNextScan}
              className={`w-full py-4 px-6 font-black text-sm sm:text-base rounded-2xl shadow-2xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer ring-4 ${
                verificationResult.success
                  ? 'bg-white hover:bg-emerald-50 text-emerald-950 ring-white/30'
                  : 'bg-white hover:bg-rose-50 text-red-950 ring-white/30'
              }`}
            >
              <Camera className="w-5 h-5 shrink-0 text-emerald-700" />
              <span>NEXT SCAN (अगला टिकट / पास स्कैन करें) ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* PASS GATE VERIFICATION DRAWER / MODAL (Biometric 1:1 Member Verification) */}
      {activePassForGate && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col space-y-3.5 p-4 sm:p-6 relative my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="font-black text-slate-900 text-base sm:text-lg tracking-tight">
                    Pass Member Verification
                  </h3>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                    {activePassForGate.pass_type}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Pass <strong>{activePassForGate.pass_number}</strong> • Holder:{' '}
                  <strong>{activePassForGate.holder_name}</strong> • Exp: <strong>{activePassForGate.valid_through}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivePassForGate(null);
                  handleNextScan();
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction Banner */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-700 flex items-center justify-between">
              <span>Select the person standing at the gate from covered family members:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border">
                1 Person / Scan
              </span>
            </div>

            {/* Covered Members List Grid */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {activePassMembers.map(m => {
                const isSelected = selectedMember?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMember(m);
                      setFreshGatePhoto(null);
                      setFreshBiometricTemplate(null);
                      setGateMemberVerificationError(null);
                    }}
                    className={`w-full p-2.5 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/90 border-emerald-500 shadow-sm ring-2 ring-emerald-400'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {m.photo_url ? (
                        <img
                          src={m.photo_url}
                          alt={m.full_name}
                          className="w-11 h-11 rounded-xl object-cover border-2 border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center font-black text-xs shrink-0 border">
                          {m.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-black text-slate-900 truncate">
                          {m.full_name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                            m.is_primary_holder
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {m.relationship || (m.is_primary_holder ? 'Primary' : 'Member')}
                          </span>
                          <span className="text-[9px] text-emerald-700 font-bold flex items-center gap-0.5">
                            <Fingerprint className="w-3 h-3 text-emerald-600" /> Enrolled
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1">
                          <Check className="w-3 h-3" /> Present at Gate
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">
                          Select
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Gate Verification Actions for Selected Member */}
            {selectedMember && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-black text-slate-800">
                    Verify Identity: <strong className="text-emerald-800">{selectedMember.full_name}</strong>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    Live Photo & 1:1 Biometric Required
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Step 1: Fresh Live Photo Capture */}
                  <div className="bg-white border rounded-xl p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {freshGatePhoto ? (
                        <img
                          src={freshGatePhoto}
                          alt="Fresh Gate Photo"
                          className="w-11 h-11 rounded-lg object-cover border-2 border-emerald-500 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-700 border-2 border-dashed border-amber-300 flex items-center justify-center shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <div className="text-[11px] font-black text-slate-900">1. Gate Photo</div>
                        <div className="text-[9px] text-slate-500">
                          {freshGatePhoto ? '✓ Live photo taken' : 'Mandatory snapshot'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCapturingGatePhoto(true)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                        freshGatePhoto
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                      }`}
                    >
                      {freshGatePhoto ? 'Retake' : '📸 Take Photo'}
                    </button>
                  </div>

                  {/* Step 2: Fresh Fingerprint Scan */}
                  <div className="bg-white border rounded-xl p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                        freshBiometricTemplate
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                          : 'bg-amber-50 border-dashed border-amber-300 text-amber-700'
                      }`}>
                        <Fingerprint className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-[11px] font-black text-slate-900">2. Fingerprint</div>
                        <div className="text-[9px] text-slate-500">
                          {freshBiometricTemplate ? `✓ Scanned (${freshBiometricQuality || 85}%)` : 'Scan on device'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleScanGateBiometric}
                      disabled={isScanningGateBiometric}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                        freshBiometricTemplate
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                    >
                      {isScanningGateBiometric ? 'Scanning...' : freshBiometricTemplate ? 'Re-scan' : '🖐️ Scan'}
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {gateMemberVerificationError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span className="font-bold">{gateMemberVerificationError}</span>
                  </div>
                )}

                {/* Admission Notice */}
                {admittedMemberNotice && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        <strong>{admittedMemberNotice.name}</strong> was successfully admitted! Select next member if multiple persons are entering.
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit Verification Button */}
                <button
                  type="button"
                  onClick={handleVerifyGateMemberEntry}
                  disabled={isVerifyingGateEntry || !freshGatePhoto || !freshBiometricTemplate}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${
                    freshGatePhoto && freshBiometricTemplate
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {isVerifyingGateEntry
                      ? 'Verifying 1:1 Match...'
                      : !freshGatePhoto
                        ? '1. Take Gate Photo First'
                        : !freshBiometricTemplate
                          ? '2. Scan Fingerprint to Admit'
                          : `Verify & Admit ${selectedMember.full_name} (1 Person)`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fresh Gate Camera Capture Modal */}
      <CameraModal
        isOpen={isCapturingGatePhoto}
        title={`Gate Photo: ${selectedMember?.full_name || 'Member'}`}
        subtitle="Capture crisp snapshot of person standing at the gate"
        onCaptureConfirm={photoUrl => {
          setFreshGatePhoto(photoUrl);
          setIsCapturingGatePhoto(false);
        }}
        onClose={() => setIsCapturingGatePhoto(false)}
      />

      {/* Aesthetic Live Scan Statistics Row (2 Rich Cards) */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Card 1: Tickets Scanned */}
        <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 backdrop-blur-xl flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
            <QrCode className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Tickets Scanned
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 leading-none">
              {scanSummary.totalScannedTickets}
              <span className="text-xs font-bold text-slate-400 ml-1.5">Tkts</span>
            </div>
          </div>
        </div>

        {/* Card 2: Admitted Visitors */}
        <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 border border-emerald-700/60 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-black text-emerald-200 uppercase tracking-wider">
              Admitted Visitors
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-0.5 leading-none">
              {scanSummary.totalPersonsAdmitted}
              <span className="text-xs font-bold text-emerald-300 ml-1.5">Persons</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-300" />
          </div>
        </div>
      </div>

      {/* Mobile Number Pass Validation (Forgot Pass Entry) */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50/40 border border-blue-200/90 rounded-3xl p-4 sm:p-5 shadow-xl shadow-blue-950/10 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm tracking-tight">
                Pass Entry via Mobile Number
              </h2>
            </div>
          </div>
        </div>

        <form onSubmit={handlePhoneValidate} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Phone className="w-4 h-4 text-blue-600" />
            </div>
            <input
              type="tel"
              maxLength={10}
              placeholder="Enter 10-digit mobile number (e.g. 98XXXXXXXX)"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-blue-200 hover:border-blue-400 focus:border-blue-600 rounded-xl text-sm font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition shadow-inner font-mono tracking-wider"
            />
          </div>

          <button
            type="submit"
            disabled={isPhoneValidating || phoneInput.length < 10}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
          >
            {isPhoneValidating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Verify & Open Pass</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Camera Live Scanner Box (Optical QR Scan Only - Zero Manual Entry) */}
      <div className="bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-3xl p-5 sm:p-7 shadow-xl shadow-emerald-950/20 backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-950/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm tracking-tight">Optical QR Scanner</h2>
              <p className="text-[10px] text-slate-500 font-medium">Automatic ultra-fast barcode recognition</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-100/90 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200/80 shadow-2xs"
              title="Upload QR photo or screenshot"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Upload Photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              type="button"
              onClick={scannerActive ? stopScanner : startScanner}
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                scannerActive
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {scannerActive ? 'Pause Camera' : 'Start Camera'}
            </button>
          </div>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative rounded-3xl overflow-hidden bg-slate-950 min-h-[350px] flex items-center justify-center border-2 border-slate-800 shadow-2xl">
          <div id={scannerContainerId} className="w-full max-w-sm mx-auto"></div>

          {/* Software Lock Overlay */}
          {isScanLocked && (
            <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white space-y-4 z-10 animate-in fade-in duration-200">
              <div className={`p-4 rounded-3xl border shadow-xl ${
                verificationResult?.success
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/20'
                  : 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-500/20'
              }`}>
                {verificationResult?.success ? (
                  <CheckCircle2 className="w-12 h-12" />
                ) : (
                  <XCircle className="w-12 h-12" />
                )}
              </div>
              <div>
                <p className="text-base font-black text-white">
                  {verificationResult?.success ? 'Ticket / Pass Verified • Camera Paused' : 'Scan Blocked • Camera Paused'}
                </p>
                <p className="text-xs text-slate-300 mt-1 max-w-xs font-medium">
                  Review details above. Tap below when ready to scan next visitor:
                </p>
              </div>
              <button
                type="button"
                onClick={handleNextScan}
                className="w-full max-w-xs py-3.5 px-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/50 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span>NEXT SCAN (OPEN CAMERA) ➔</span>
              </button>
            </div>
          )}

          {/* Camera Off state */}
          {!scannerActive && !isScanLocked && !cameraError && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
              <div className="w-16 h-16 bg-slate-900 text-slate-400 rounded-3xl border border-slate-800 flex items-center justify-center shadow-inner">
                <Camera className="w-8 h-8 opacity-70" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Camera is Off</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Tap below to turn on the camera for scanning.</p>
              </div>
              <button
                type="button"
                onClick={startScanner}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/50 active:scale-95 transition"
              >
                <Camera className="w-4 h-4" /> Start Camera
              </button>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
              <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Camera Access Notice</p>
                <p className="text-xs text-slate-300 max-w-sm mt-1">{cameraError}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload QR Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security Badge */}
        <div className="pt-3 border-t border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-900 font-black bg-emerald-50 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl">
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>Anti-Fraud Mode Active • Optical QR, Pass Biometrics & Mobile Lookup</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 font-bold">
            <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sound alerts enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
};
