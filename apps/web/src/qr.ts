/**
 * QR payload encoding / decoding.
 *
 * QR codes are AES-GCM encrypted so a phone camera sees opaque random-looking
 * bytes (base64url, ~63+ chars with no recognisable prefix or structure).
 * Only the app — which holds the shared key — can decrypt the payload and
 * recover the real token to send to the backend.
 *
 * Wire format (base64url-encoded):
 *   <12-byte IV> | <AES-GCM ciphertext + 16-byte auth tag>
 *
 * Legacy bare tokens (starting "BVC-") produced before this scheme was
 * introduced pass through decodeQr unchanged so existing printed cards
 * continue to work during any rollover period.
 */

// ── Shared secret ─────────────────────────────────────────────────────────────
// Must match QR_SECRET in apps/security/src/qr.js and any other app that scans.
// Change this value to invalidate ALL existing encrypted QR codes instantly.
const QR_SECRET = 'BVC-QR-SECRET-2026-CHANGE-ME-IN-PRODUCTION';

// ── Internal helpers ──────────────────────────────────────────────────────────

let _cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  const encoder = new TextEncoder();
  const raw = encoder.encode(QR_SECRET);
  // Derive a 256-bit AES key from the secret string via SHA-256
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _cachedKey = await crypto.subtle.importKey(
    'raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
  return _cachedKey;
}

function toBase64url(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a raw qrToken into an opaque base64url string suitable for QR encoding.
 * A phone scanning this QR sees random-looking bytes with no recognisable structure.
 */
export async function encodeQr(rawToken: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(rawToken),
  );
  // Concatenate IV + ciphertext and base64url-encode the whole thing
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return toBase64url(combined.buffer);
}

/**
 * Decrypt a QR payload back to the raw token.
 * Handles:
 *   - new encrypted payloads (opaque base64url)
 *   - legacy bare tokens starting with "BVC-" (pass-through)
 */
export async function decodeQr(scanned: string): Promise<string> {
  const trimmed = scanned.trim();

  // Legacy tokens pass through unchanged
  if (trimmed.startsWith('BVC-')) return trimmed;

  // Also handle the old dead-URL format if any cards were printed with it
  const OLD_PREFIX = 'https://bvc-id.ng/v/';
  const payload = trimmed.startsWith(OLD_PREFIX)
    ? trimmed.slice(OLD_PREFIX.length)
    : trimmed;

  // If after stripping it looks like a legacy token, return it
  if (payload.startsWith('BVC-')) return payload;

  try {
    const key = await getKey();
    const combined = fromBase64url(payload);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // Decryption failed — likely not from our app or corrupted; return raw
    return trimmed;
  }
}
