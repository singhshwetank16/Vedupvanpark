export interface DeviceInfo {
  deviceName: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET';
  os: string;
  browser: string;
  hardwareSummary?: string;
}

/**
 * Accurately detects client device & system details.
 * Detects:
 * 1. User-customized device nickname (e.g. "Counter 1 PC", "Gate 1 Phone") if configured.
 * 2. Mobile phone manufacturer & model (Samsung, Vivo, Xiaomi/Redmi, Oppo, Realme, OnePlus, Pixel, iPhone, iPad).
 * 3. Desktop OS & Browser (Windows 11/10 PC, Mac, Linux).
 * 4. Hardware graphics & screen context.
 */
export function getSystemDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceName: 'System Terminal',
      deviceType: 'DESKTOP',
      os: 'Unknown OS',
      browser: 'Browser',
    };
  }

  // 0. Check if user configured a custom device name locally
  try {
    const customName = localStorage.getItem('vup_custom_device_name');
    if (customName && customName.trim()) {
      const isMobileHint = /mobile|phone|android|iphone/i.test(customName) || window.innerWidth < 768;
      return {
        deviceName: customName.trim(),
        deviceType: isMobileHint ? 'MOBILE' : 'DESKTOP',
        os: 'Configured',
        browser: 'Web App',
      };
    }
  } catch {
    // ignore
  }

  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isTouch = maxTouchPoints > 0;
  const screenWidth = typeof window !== 'undefined' ? (window.screen?.width || window.innerWidth) : 1024;
  const isSmallScreen = screenWidth < 768;

  // 1. Detect Browser
  let browser = 'Browser';
  if (/edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/samsungbrowser/i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/chrome|crios/i.test(ua) && !/opr|opera/i.test(ua)) {
    browser = 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  }

  // 2. Hardware / GPU detection via WebGL (reveals Qualcomm Adreno, Mali, Apple GPU, Intel, etc.)
  let gpuChip = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const unmasked = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        if (/adreno/i.test(unmasked)) {
          gpuChip = 'Snapdragon';
        } else if (/mali/i.test(unmasked)) {
          gpuChip = 'MediaTek / Exynos';
        } else if (/apple/i.test(unmasked)) {
          gpuChip = 'Apple Bionic';
        } else if (/geforce|nvidia/i.test(unmasked)) {
          gpuChip = 'NVIDIA';
        } else if (/radeon|amd/i.test(unmasked)) {
          gpuChip = 'AMD';
        } else if (/intel/i.test(unmasked)) {
          gpuChip = 'Intel';
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. UserAgentData Hints (Chromium 90+)
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean; platform?: string; model?: string } })?.userAgentData;
  const isUaMobile = uaData?.mobile;
  const uaDataPlatform = uaData?.platform;

  let os = 'Unknown OS';
  let deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' = 'DESKTOP';
  let hardwareName = '';

  // Check iOS
  const isIPhone = /iphone/i.test(ua);
  const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad || /ipod/i.test(ua);

  if (isIOS) {
    os = 'iOS';
    if (isIPad) {
      deviceType = 'TABLET';
      hardwareName = 'Apple iPad';
    } else {
      deviceType = 'MOBILE';
      hardwareName = 'Apple iPhone';
    }
  } else if (/android/i.test(ua) || uaDataPlatform === 'Android' || (isTouch && isSmallScreen && !/windows|macintosh/i.test(ua))) {
    // Android Detection
    os = 'Android';
    const isTablet = /tablet/i.test(ua) || (!/mobile/i.test(ua) && isTouch && screenWidth >= 600);
    deviceType = isTablet ? 'TABLET' : 'MOBILE';

    // Detailed Brand / Model Extraction
    if (/samsung|sm-[a-z0-9]+/i.test(ua)) {
      const smMatch = ua.match(/SM-[A-Z0-9]+/i);
      hardwareName = smMatch ? `Samsung (${smMatch[0]})` : 'Samsung Galaxy';
    } else if (/redmi|xiaomi|poco/i.test(ua)) {
      const rMatch = ua.match(/(Redmi[^;)]*|POCO[^;)]*|Xiaomi[^;)]*)/i);
      hardwareName = rMatch ? rMatch[0] : 'Xiaomi / Redmi';
    } else if (/oneplus/i.test(ua)) {
      hardwareName = 'OnePlus Mobile';
    } else if (/vivo/i.test(ua)) {
      const vMatch = ua.match(/vivo\s*([a-z0-9]+)/i);
      hardwareName = vMatch ? `Vivo (${vMatch[1]})` : 'Vivo Mobile';
    } else if (/oppo|cph[0-9]+/i.test(ua)) {
      const oMatch = ua.match(/CPH[0-9]+/i);
      hardwareName = oMatch ? `Oppo (${oMatch[0]})` : 'Oppo Mobile';
    } else if (/realme|rmx[0-9]+/i.test(ua)) {
      hardwareName = 'Realme Mobile';
    } else if (/pixel/i.test(ua)) {
      const pMatch = ua.match(/Pixel\s*[0-9a-z]*/i);
      hardwareName = pMatch ? `Google ${pMatch[0]}` : 'Google Pixel';
    } else if (/motorola|moto/i.test(ua)) {
      hardwareName = 'Motorola Phone';
    } else {
      // General Android phone pattern
      const androidModelMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*Build/i);
      if (androidModelMatch && androidModelMatch[1]) {
        const rawModel = androidModelMatch[1].trim();
        if (rawModel && !rawModel.includes('Linux') && rawModel.length < 25) {
          hardwareName = `Android (${rawModel})`;
        } else {
          hardwareName = gpuChip ? `Android Mobile (${gpuChip})` : 'Android Mobile';
        }
      } else {
        hardwareName = gpuChip ? `Android Mobile (${gpuChip})` : 'Android Mobile';
      }
    }
  } else if (/windows nt 10\.0/i.test(ua) || uaDataPlatform === 'Windows') {
    os = 'Windows 10/11';
    deviceType = 'DESKTOP';
    hardwareName = gpuChip ? `Windows PC (${gpuChip})` : 'Windows PC';
  } else if (/windows nt/i.test(ua)) {
    os = 'Windows';
    deviceType = 'DESKTOP';
    hardwareName = 'Windows PC';
  } else if (/macintosh|mac os x/i.test(ua) || uaDataPlatform === 'macOS') {
    os = 'macOS';
    deviceType = 'DESKTOP';
    hardwareName = 'Apple Mac Desktop';
  } else if (/linux/i.test(ua) || uaDataPlatform === 'Linux') {
    os = 'Linux';
    deviceType = 'DESKTOP';
    hardwareName = 'Linux PC';
  } else {
    if ((isTouch || isUaMobile) && isSmallScreen) {
      deviceType = 'MOBILE';
      hardwareName = 'Mobile Device';
    } else {
      deviceType = 'DESKTOP';
      hardwareName = 'System Computer';
    }
  }

  // Construct clear descriptive device label
  // e.g. "Windows PC • Chrome" or "Samsung Galaxy • Chrome" or "Apple iPhone • Safari"
  const deviceName = `${hardwareName} • ${browser}`;

  return {
    deviceName,
    deviceType,
    os,
    browser,
    hardwareSummary: hardwareName,
  };
}

/**
 * Helper to get or set a customized device name (e.g. "Counter 1 PC" or "Main Gate Phone")
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
