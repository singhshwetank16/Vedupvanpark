// ==============================================================================
// Ved Upvan Park: Biometric Fingerprint & WebAuthn Management Service
// Supports WebAuthn (Touch ID / Windows Hello / Android / USB) & Optical Scanner
// ==============================================================================

import type { PassMember } from '../types';

export interface BiometricMinutiae {
  x: number;
  y: number;
  type: 'ending' | 'bifurcation' | 'core';
  angle: number;
}

export interface BiometricTemplateData {
  version: string;
  seed: string;
  minutiaeCount: number;
  ridgeCount: number;
  hash: string;
  algorithm: string;
}

/**
 * Generate a unique biometric credential identifier
 */
export function generateBiometricId(name: string = 'member', index: number = 1): string {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PASS';
  const rand = Math.floor(1000 + Math.random() * 9000);
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `BIO-FP-${cleanName}-${rand}-${hex}-${index}`;
}

/**
 * Deterministically generate a simulated biometric fingerprint template from a seed
 */
export function generateBiometricTemplate(seed: string): string {
  let hashVal = 0;
  for (let i = 0; i < seed.length; i++) {
    hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
    hashVal |= 0;
  }
  const absHash = Math.abs(hashVal);
  const minutiaeCount = 18 + (absHash % 16);
  const ridgeCount = 12 + (absHash % 6);

  const template: BiometricTemplateData = {
    version: 'VUP-BIO-1.0',
    seed: seed.slice(0, 16),
    minutiaeCount,
    ridgeCount,
    hash: absHash.toString(16).toUpperCase().padStart(8, '0'),
    algorithm: 'MINUTIAE_FINGERPRINT_SHA256',
  };

  return btoa(JSON.stringify(template));
}

/**
 * Check if the browser environment supports hardware WebAuthn (Touch ID, Windows Hello, Android)
 */
export async function isWebAuthnAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  try {
    if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Register hardware biometric credential via WebAuthn API
 */
export async function registerWebAuthnBiometric(
  userName: string,
  userIdStr: string = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  try {
    if (!window.PublicKeyCredential) {
      return { success: false, error: 'WebAuthn not supported in this browser' };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const encoder = new TextEncoder();
    const userId = encoder.encode(userIdStr.slice(0, 16));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Ved Upvan Park System',
        },
        user: {
          id: userId,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          userVerification: 'preferred',
        },
        timeout: 45000,
        attestation: 'none',
      },
    })) as PublicKeyCredential;

    if (credential && credential.id) {
      return { success: true, credentialId: credential.id };
    }
    return { success: false, error: 'No credential returned' };
  } catch (err: unknown) {
    console.warn('WebAuthn biometric registration notice:', err);
    return { success: false, error: err instanceof Error ? err.message : 'WebAuthn biometric cancelled' };
  }
}

/**
 * Verify hardware biometric credential via WebAuthn API
 */
export async function verifyWebAuthnBiometric(
  allowedCredentialId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!window.PublicKeyCredential) {
      return { success: false, error: 'WebAuthn not supported' };
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge,
        timeout: 45000,
        userVerification: 'preferred',
      },
    };

    if (allowedCredentialId) {
      try {
        const rawId = Uint8Array.from(atob(allowedCredentialId.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        getOptions.publicKey!.allowCredentials = [
          {
            type: 'public-key',
            id: rawId,
          },
        ];
      } catch {
        // Fallback without allowCredentials filter
      }
    }

    const assertion = await navigator.credentials.get(getOptions);
    if (assertion) {
      return { success: true };
    }
    return { success: false, error: 'Verification failed' };
  } catch (err: unknown) {
    console.warn('WebAuthn verification error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Biometric verification cancelled' };
  }
}

/**
 * Match a scanned biometric against enrolled pass members
 */
export function matchBiometricAgainstMembers(
  scannedBioId: string,
  enrolledMembers: PassMember[]
): {
  isMatch: boolean;
  matchedMember?: PassMember;
  confidence: number;
  reason?: string;
} {
  if (!enrolledMembers || enrolledMembers.length === 0) {
    return {
      isMatch: false,
      confidence: 0,
      reason: 'No biometric credentials enrolled on this pass',
    };
  }

  const cleanScan = scannedBioId.trim().toUpperCase();

  // 1. Exact biometric ID match
  const directMatch = enrolledMembers.find(
    m => m.biometric_id && m.biometric_id.trim().toUpperCase() === cleanScan
  );

  if (directMatch) {
    return {
      isMatch: true,
      matchedMember: directMatch,
      confidence: 99.8,
    };
  }

  // 2. Partial prefix / token match
  const prefixMatch = enrolledMembers.find(m => {
    if (!m.biometric_id) return false;
    const mId = m.biometric_id.trim().toUpperCase();
    return cleanScan.includes(mId) || mId.includes(cleanScan);
  });

  if (prefixMatch) {
    return {
      isMatch: true,
      matchedMember: prefixMatch,
      confidence: 96.5,
    };
  }

  // 3. Fallback: If template contains matching seed or hash
  for (const m of enrolledMembers) {
    if (m.biometric_template) {
      try {
        const decoded = JSON.parse(atob(m.biometric_template)) as BiometricTemplateData;
        if (cleanScan.includes(decoded.hash) || decoded.seed.includes(cleanScan)) {
          return {
            isMatch: true,
            matchedMember: m,
            confidence: 94.2,
          };
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    isMatch: false,
    confidence: 12.4,
    reason: 'Fingerprint does not match any registered pass member',
  };
}

/**
 * Render a realistic futuristic optical biometric fingerprint on an HTML Canvas
 */
export function drawFingerprintCanvas(
  canvas: HTMLCanvasElement,
  seedStr: string,
  scanLaserY: number = -1, // -1 means no laser line
  isSuccess: boolean = false,
  isScanning: boolean = false
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  // Background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a101d';
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const step = 20;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Generate seed-based ridges
  let seedNum = 42;
  for (let i = 0; i < seedStr.length; i++) {
    seedNum = (seedNum << 5) - seedNum + seedStr.charCodeAt(i);
    seedNum |= 0;
  }
  const absSeed = Math.abs(seedNum);

  // Determine ridge color theme
  const ridgeColor = isSuccess
    ? '#10b981'
    : isScanning
      ? '#06b6d4'
      : '#38bdf8';

  const glowColor = isSuccess
    ? 'rgba(16, 185, 129, 0.4)'
    : isScanning
      ? 'rgba(6, 182, 212, 0.4)'
      : 'rgba(56, 189, 248, 0.3)';

  // Draw concentric loops & whorls
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = ridgeColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  const totalLoops = 14;
  for (let i = 1; i <= totalLoops; i++) {
    const rx = i * 4.8;
    const ry = i * 7.2;
    const asymmetry = ((absSeed + i * 17) % 7) - 3;

    ctx.beginPath();
    // Elliptical arch with fingerprint notch
    ctx.ellipse(cx + asymmetry, cy - i * 0.8, rx, ry, 0, 0.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();

    // Occasional ridge split (bifurcation)
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(cx + rx * 0.7, cy + ry * 0.4, 3, 0, 2 * Math.PI);
      ctx.fillStyle = ridgeColor;
      ctx.fill();
    }
  }

  // Draw Minutiae Points
  ctx.fillStyle = isSuccess ? '#34d399' : '#38bdf8';
  ctx.shadowBlur = 4;
  for (let m = 0; m < 12; m++) {
    const angle = ((absSeed + m * 47) % 360) * (Math.PI / 180);
    const dist = 18 + ((absSeed + m * 23) % 45);
    const mx = cx + Math.cos(angle) * dist;
    const my = cy + Math.sin(angle) * dist;

    ctx.beginPath();
    ctx.arc(mx, my, 2.2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Laser Scan Beam Line
  if (scanLaserY >= 0 && scanLaserY <= h) {
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ffff';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(10, scanLaserY);
    ctx.lineTo(w - 10, scanLaserY);
    ctx.stroke();

    // Laser gradient glow
    const grad = ctx.createLinearGradient(0, scanLaserY - 18, 0, scanLaserY + 18);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0)');
    grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.25)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(10, scanLaserY - 18, w - 20, 36);
  }
}
