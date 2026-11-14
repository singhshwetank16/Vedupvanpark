// Web Crypto API implementation for VUP Ticket & Pass Security
// Generates cryptographically secure QR tokens, SHA-256 hashes, and AES-GCM encryption

const DEFAULT_SECRET = 'VUP_PARK_SECRET_KEY_2026_SIRSAGANJ_ENC'; // In production, provide via backend env

async function getKey(rawSecret = DEFAULT_SECRET): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(rawSecret.padEnd(32, '0').slice(0, 32)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('vup_salt_sirsaganj'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Compute SHA-256 hash (64 hex characters) of any text
export async function computeSha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return bufToHex(hashBuffer);
}

// Generate secure random QR token
export function generateSecureQrToken(docType: 'TICKET' | 'MONTHLY' | 'YEARLY' | 'FAMILY', docNumber: string): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = bufToHex(randomBytes.buffer);
  return `VUP:SECURE:${docType}:${docNumber}:${randomHex}`;
}

// Encrypt QR token using AES-GCM 256 (produces ciphertext, nonce, tag)
export async function encryptQrToken(token: string): Promise<{
  ciphertext: string;
  nonce: string;
  tag: string;
  sha256: string;
}> {
  const enc = new TextEncoder();
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce for GCM

  const encryptedBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    key,
    enc.encode(token)
  );

  // In Web Crypto AES-GCM, the last 16 bytes of encryptedBuf are the Auth Tag
  const encryptedBytes = new Uint8Array(encryptedBuf);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - 16);
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - 16);

  const sha256 = await computeSha256(token);

  return {
    ciphertext: bufToHex(cipherBytes.buffer),
    nonce: bufToHex(iv.buffer),
    tag: bufToHex(tagBytes.buffer),
    sha256,
  };
}

// Decrypt QR token for authorized reprint
export async function decryptQrToken(
  ciphertextHex: string,
  nonceHex: string,
  tagHex: string
): Promise<string> {
  const key = await getKey();
  const cipherBytes = hexToBuf(ciphertextHex);
  const tagBytes = hexToBuf(tagHex);
  const nonceBytes = hexToBuf(nonceHex);

  // Combine ciphertext and tag
  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(tagBytes, cipherBytes.length);

  const decryptedBuf = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonceBytes as unknown as BufferSource,
      tagLength: 128,
    },
    key,
    combined as unknown as BufferSource
  );

  return new TextDecoder().decode(decryptedBuf);
}
