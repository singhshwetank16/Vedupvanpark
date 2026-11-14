export interface PureHardwareInfo {
  hardwareSummary: string;
  os: string;
  browser: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET';
  isMobile: boolean;
}

export interface DeviceInfo {
  deviceName: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET';
  os: string;
  browser: string;
  hardwareSummary: string;
  isMobile: boolean;
  assignedSystemName?: string;
}

/**
 * Pure Hardware & OS Detection (NO custom/nickname override).
 * Always inspects real user agent, GPU WebGL renderer, touch capabilities, and screen context.
 */
export function detectPureHardware(): PureHardwareInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      hardwareSummary: 'Server Environment',
      os: 'Unknown OS',
      browser: 'Web App',
      deviceType: 'DESKTOP',
      isMobile: false,
    };
  }

  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isTouch = maxTouchPoints > 0;
  const screenWidth = typeof window !== 'undefined' ? (window.screen?.width || window.innerWidth) : 1024;
  const isSmallScreen = screenWidth < 768;

  // 1. Hardware / GPU detection via WebGL (reveals Qualcomm Snapdragon, Mali, Apple GPU, Intel, NVIDIA, AMD)
  let gpuChip = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const unmasked = ((gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') as string;
        if (/adreno\s*([0-9]+)?/i.test(unmasked)) {
          const m = unmasked.match(/adreno\s*([0-9]+)/i);
          gpuChip = m ? `Snapdragon Adreno ${m[1]}` : 'Snapdragon';
        } else if (/mali/i.test(unmasked)) {
          const m = unmasked.match(/mali-([a-z0-9]+)/i);
          gpuChip = m ? `Mali-${m[1].toUpperCase()}` : 'MediaTek / Exynos';
        } else if (/apple/i.test(unmasked)) {
          gpuChip = 'Apple GPU';
        } else if (/geforce|nvidia|rtx|gtx/i.test(unmasked)) {
          const m = unmasked.match(/(RTX\s*[0-9]+|GTX\s*[0-9]+)/i);
          gpuChip = m ? `NVIDIA ${m[1]}` : 'NVIDIA';
        } else if (/radeon|amd/i.test(unmasked)) {
          gpuChip = 'AMD Radeon';
        } else if (/intel/i.test(unmasked)) {
          gpuChip = 'Intel HD/Iris';
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. UserAgentData Hints (Modern Chromium)
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean; platform?: string; model?: string } })?.userAgentData;
  const isUaMobile = Boolean(uaData?.mobile);
  const uaDataPlatform = uaData?.platform;

  let os = 'Unknown OS';
  let deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' = 'DESKTOP';
  let hardwareName = '';
  let isMobileDevice = false;

  // 3. iOS Detection (iPhone / iPad / iPod)
  const isIPhone = /iphone/i.test(ua);
  const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad || /ipod/i.test(ua);

  if (isIOS) {
    const iosVerMatch = ua.match(/OS\s*([0-9_]+)/i);
    const iosVer = iosVerMatch ? `iOS ${iosVerMatch[1].replace(/_/g, '.')}` : 'iOS';
    os = iosVer;
    isMobileDevice = true;

    if (isIPad) {
      deviceType = 'TABLET';
      hardwareName = 'Apple iPad';
    } else {
      deviceType = 'MOBILE';
      hardwareName = 'Apple iPhone';
    }
  } else if (/android/i.test(ua) || uaDataPlatform === 'Android' || (isTouch && isSmallScreen && !/windows|macintosh/i.test(ua))) {
    // 4. Android Detection & Brand / Model Identification
    isMobileDevice = true;
    const androidVerMatch = ua.match(/Android\s*([0-9.]+)/i);
    os = androidVerMatch ? `Android ${androidVerMatch[1]}` : 'Android';

    const isTablet = /tablet/i.test(ua) || (!/mobile/i.test(ua) && isTouch && screenWidth >= 600);
    deviceType = isTablet ? 'TABLET' : 'MOBILE';

    // Detailed Mobile Brand & Model Extraction
    if (/samsung|sm-[a-z0-9]+/i.test(ua)) {
      const smMatch = ua.match(/SM-[A-Z0-9]+/i);
      hardwareName = smMatch ? `Samsung Galaxy (${smMatch[0]})` : 'Samsung Galaxy';
    } else if (/redmi|xiaomi|poco/i.test(ua)) {
      const rMatch = ua.match(/(Redmi[^;)]*|POCO[^;)]*|Xiaomi[^;)]*)/i);
      hardwareName = rMatch ? rMatch[0].trim() : 'Xiaomi / Redmi';
    } else if (/oneplus|cph2449|cph2451|ne2211/i.test(ua)) {
      const opMatch = ua.match(/OnePlus\s*([A-Za-z0-9+]+)/i);
      hardwareName = opMatch ? `OnePlus ${opMatch[1]}` : 'OnePlus Mobile';
    } else if (/vivo|iqoo|v2[0-9]+/i.test(ua)) {
      const vMatch = ua.match(/(vivo\s*[a-z0-9]+|iQOO\s*[a-z0-9]+)/i);
      hardwareName = vMatch ? vMatch[0].trim() : 'Vivo Mobile';
    } else if (/oppo|cph[0-9]+/i.test(ua)) {
      const oMatch = ua.match(/CPH[0-9]+/i);
      hardwareName = oMatch ? `Oppo (${oMatch[0]})` : 'Oppo Mobile';
    } else if (/realme|rmx[0-9]+/i.test(ua)) {
      const rmxMatch = ua.match(/RMX[0-9]+/i);
      hardwareName = rmxMatch ? `Realme (${rmxMatch[0]})` : 'Realme Mobile';
    } else if (/pixel/i.test(ua)) {
      const pMatch = ua.match(/Pixel\s*[0-9a-z ]*/i);
      hardwareName = pMatch ? `Google ${pMatch[0].trim()}` : 'Google Pixel';
    } else if (/motorola|moto/i.test(ua)) {
      const motoMatch = ua.match(/moto\s*[a-z0-9+ ]+/i);
      hardwareName = motoMatch ? `Motorola (${motoMatch[0].trim()})` : 'Motorola Mobile';
    } else {
      // General Android phone pattern
      const androidModelMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*Build/i);
      if (androidModelMatch && androidModelMatch[1]) {
        const rawModel = androidModelMatch[1].trim();
        if (rawModel && !rawModel.includes('Linux') && rawModel.length < 30) {
          hardwareName = `Android (${rawModel})`;
        } else {
          hardwareName = gpuChip ? `Android Mobile (${gpuChip})` : 'Android Mobile';
        }
      } else {
        hardwareName = gpuChip ? `Android Mobile (${gpuChip})` : 'Android Mobile';
      }
    }
  } else if (/windows nt 10\.0/i.test(ua) || uaDataPlatform === 'Windows') {
    // 5. Windows PC
    os = 'Windows 10/11';
    deviceType = 'DESKTOP';
    isMobileDevice = false;
    hardwareName = gpuChip ? `Windows 11 PC (${gpuChip})` : 'Windows 11 PC';
  } else if (/windows nt/i.test(ua)) {
    os = 'Windows PC';
    deviceType = 'DESKTOP';
    isMobileDevice = false;
    hardwareName = 'Windows PC';
  } else if (/macintosh|mac os x/i.test(ua) || uaDataPlatform === 'macOS') {
    os = 'macOS';
    deviceType = 'DESKTOP';
    isMobileDevice = false;
    hardwareName = gpuChip ? `Apple Mac (${gpuChip})` : 'Apple Mac Desktop';
  } else if (/linux/i.test(ua) || uaDataPlatform === 'Linux') {
    os = 'Linux';
    deviceType = 'DESKTOP';
    isMobileDevice = false;
    hardwareName = 'Linux PC';
  } else {
    if ((isTouch || isUaMobile) && isSmallScreen) {
      deviceType = 'MOBILE';
      isMobileDevice = true;
      os = 'Mobile OS';
      hardwareName = 'Mobile Device';
    } else {
      deviceType = 'DESKTOP';
      isMobileDevice = false;
      os = 'Desktop OS';
      hardwareName = 'System Computer';
    }
  }

  // 6. Browser Detection
  let browser = 'Browser';
  if (/edg\//i.test(ua)) {
    browser = isMobileDevice ? 'Edge Mobile' : 'Edge';
  } else if (/samsungbrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) {
    browser = isMobileDevice ? 'Chrome Mobile' : 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = isMobileDevice ? 'Firefox Mobile' : 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = isMobileDevice ? 'Mobile Safari' : 'Safari';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  }

  return {
    hardwareSummary: hardwareName,
    os,
    browser,
    deviceType,
    isMobile: isMobileDevice,
  };
}

/**
 * Returns strictly auto-detected physical hardware & OS for Settings card display.
 * Guaranteed to NEVER return "Configured • Web App".
 */
export function getAutoDetectedHardware(): PureHardwareInfo {
  return detectPureHardware();
}

/**
 * Returns full system device info, integrating:
 * 1. Mobile auto-detection (takes precedence if device is a phone/tablet).
 * 2. Designated staff system name (e.g. "SHWETANK SYSTEM", "Ticket Counter 1 PC", "Gate 1 Mobile Scanner").
 * 3. Local custom terminal override if configured.
 */
export function getSystemDeviceInfo(staffSystemName?: string): DeviceInfo {
  const pure = detectPureHardware();

  // Try to find staff designated system name if not passed
  let designatedName = (staffSystemName || '').trim();
  if (!designatedName && typeof localStorage !== 'undefined') {
    try {
      const authStaffJson = localStorage.getItem('vup_auth_staff');
      if (authStaffJson) {
        const auth = JSON.parse(authStaffJson);
        if (auth?.system_name) {
          designatedName = auth.system_name.trim();
        }
      }
    } catch {
      // ignore
    }
  }

  // Check local terminal nickname override
  let localCustomName = '';
  if (typeof localStorage !== 'undefined') {
    try {
      localCustomName = (localStorage.getItem('vup_custom_device_name') || '').trim();
    } catch {
      // ignore
    }
  }

  // Active terminal label: local custom name takes priority on this physical machine if set,
  // otherwise staff user's designated system name.
  const activeTerminalName = localCustomName || designatedName;

  let deviceName = '';

  if (pure.isMobile) {
    // On Mobile: Mobile hardware model is ALWAYS clearly indicated!
    if (activeTerminalName) {
      deviceName = `${activeTerminalName} [${pure.hardwareSummary}] • ${pure.browser}`;
    } else {
      deviceName = `${pure.hardwareSummary} (${pure.os} • ${pure.browser})`;
    }
  } else {
    // On Desktop:
    if (activeTerminalName) {
      deviceName = `${activeTerminalName} (${pure.hardwareSummary} • ${pure.browser})`;
    } else {
      deviceName = `${pure.hardwareSummary} • ${pure.browser}`;
    }
  }

  return {
    deviceName,
    deviceType: pure.deviceType,
    os: pure.os,
    browser: pure.browser,
    hardwareSummary: pure.hardwareSummary,
    isMobile: pure.isMobile,
    assignedSystemName: activeTerminalName || undefined,
  };
}

/**
 * Helper to get or set a customized device name for the local terminal
 */
export function getCustomDeviceName(): string {
  try {
    return localStorage.getItem('vup_custom_device_name') || '';
  } catch {
    return '';
  }
}

export function setCustomDeviceName(name: string): void {
  try {
    if (name && name.trim()) {
      localStorage.setItem('vup_custom_device_name', name.trim());
    } else {
      localStorage.removeItem('vup_custom_device_name');
    }
  } catch {
    // ignore
  }
}
