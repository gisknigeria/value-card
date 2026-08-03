/**
 * <EncryptedQRCode token={card.qrToken} size={126} fgColor="#512b6c" />
 *
 * Drop-in replacement for <QRCode value={encodeQr(token)} ... />.
 * Encrypts the token with AES-GCM on mount so the QR image contains opaque
 * random-looking bytes — a phone camera sees nothing meaningful.
 */
import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { encodeQr } from './qr';

interface Props {
  token: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
}

export default function EncryptedQRCode({ token, size = 128, bgColor = '#ffffff', fgColor = '#000000' }: Props) {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setValue(null); return; }
    let cancelled = false;
    encodeQr(token).then((v) => { if (!cancelled) setValue(v); });
    return () => { cancelled = true; };
  }, [token]);

  if (!value) {
    // Placeholder matching the target dimensions while encrypting (instant in practice)
    return (
      <div
        style={{ width: size, height: size, background: bgColor, borderRadius: 4 }}
        aria-hidden="true"
      />
    );
  }

  return <QRCode value={value} size={size} bgColor={bgColor} fgColor={fgColor} />;
}
