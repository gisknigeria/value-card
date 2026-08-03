/**
 * QR payload encoding / decoding — security app mirror of apps/web/src/qr.ts
 *
 * QR codes are AES-GCM encrypted so a phone camera sees opaque random-looking
 * bytes (~63+ base64url chars, no BVC- prefix, no recognisable structure).
 * Only apps that hold the shared secret can decrypt the payload.
 *
 * Wire format (base64url-encoded):
 *   <12-byte IV> | <AES-GCM ciphertext + 16-byte auth tag>
 *
 * Legacy bare tokens (starting "BVC-") and the old dead-URL format pass
 * through unchanged so existing printed cards keep working.
 *
 * ⚠️  KEEP THIS SECRET IN SYNC with apps/web/src/qr.ts
 */

// ── Shared secret ─────────────────────────────────────────────────────────────
// Must match QR_SECRET in apps/web/src/qr.ts
const QR_SECRET = 'BVC-QR-SECRET-2026-CHANGE-ME-IN-PRODUCTION';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _cachedKey = null;

async function getKey() {
  if (_cachedKey) return _cachedKey;
  const raw = new TextEncoder().encode(QR_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  _cachedKey = await crypto.subtle.importKey(
    'raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
  return _cachedKey;
}

function fromBase64url(s) {
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
 * Decrypt a QR payload (scanned raw value) back to the real token.
 * Handles:
 *   - new encrypted payloads  → decrypt and return plaintext token
 *   - old dead-URL format     → strip prefix, then decrypt or pass through
 *   - legacy bare BVC- tokens → pass through unchanged
 */
export async function decodeQrPayload(raw) {
  const s = String(raw || '').trim();

  // Legacy bare token
  if (s.startsWith('BVC-')) return s;

  // Old dead-URL wrapper
  const OLD_PREFIX = 'https://bvc-id.ng/v/';
  const payload = s.startsWith(OLD_PREFIX) ? s.slice(OLD_PREFIX.length) : s;

  // After stripping old prefix it might still be a legacy bare token
  if (payload.startsWith('BVC-')) return payload;

  // Attempt AES-GCM decryption
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
    // Not from our app, corrupted, or scanned with a phone — return raw
    return s;
  }
}
