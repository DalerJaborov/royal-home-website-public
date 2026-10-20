import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Royal Home Admin";

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function makeTotp(email: string, secret: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

// Data-URL QR code the admin scans with Google Authenticator / Authy / etc.
// Generated entirely server-side — the secret never touches a third party.
export async function generateTotpQrCode(email: string, secret: string): Promise<string> {
  const totp = makeTotp(email, secret);
  return QRCode.toDataURL(totp.toString());
}

// window: 1 tolerates the code from the previous/next 30s step, covering
// small clock drift between the phone and the server.
export function verifyTotpCode(email: string, secret: string, code: string): boolean {
  const totp = makeTotp(email, secret);
  const delta = totp.validate({ token: code.trim(), window: 1 });
  return delta !== null;
}
