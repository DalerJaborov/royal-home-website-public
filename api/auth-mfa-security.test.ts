import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as OTPAuth from 'otpauth';
import type { User } from '@db/schema';
import { hashPassword } from './lib/password';
vi.mock('./lib/env', async (original) => {
  const actual = await original<typeof import('./lib/env')>();
  return { ...actual, env: { ...actual.env, appSecret: 'synthetic-mfa-security-test-signing-key' } };
});

vi.mock('./queries/users', async (original) => ({
  ...await original<typeof import('./queries/users')>(),
  findUserByUnionId: vi.fn(), changeTotpState: vi.fn(),
}));
vi.mock('./queries/connection', async (original) => ({
  ...await original<typeof import('./queries/connection')>(), isDbAvailable: () => true,
}));
import { findUserByUnionId, changeTotpState } from './queries/users';
import { authRouter } from './auth-router';

const password = 'synthetic-test-password';
const passwordHash = hashPassword(password);
const secret = new OTPAuth.Secret({ size: 20 }).base32;
let ip = 0;
let user: User;
beforeEach(() => {
  vi.clearAllMocks();
  user = { unionId: 'local-admin', role: 'admin', email: 'admin@example.test', sessionVersion: 7,
    passwordHash, totpSecret: secret, totpEnabled: true } as User;
  vi.mocked(findUserByUnionId).mockImplementation(async () => ({ ...user }));
  vi.mocked(changeTotpState).mockResolvedValue(true);
});
function caller(overrides: Partial<User> = {}) {
  const headers = new Headers();
  const api = authRouter.createCaller({ req: new Request('https://royalhome.tj/api/trpc', {
    headers: { 'x-forwarded-for': `192.0.2.${++ip}` },
  }), resHeaders: headers, user: { ...user, ...overrides } });
  return { api, headers };
}
function code() { return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate(); }

describe('admin MFA changes', () => {
  it('cannot replace an already enabled key even with the password', async () => {
    await expect(caller().api.totpSetup({ password })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
  it('requires the password before beginning a new setup', async () => {
    user.totpEnabled = false;
    await expect(caller().api.totpSetup({ password: 'wrong' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
  it('rejects a non-admin before generating a setup key', async () => {
    await expect(caller({ role: 'user' }).api.totpSetup({ password })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
  it('permits initial setup only against the observed disabled state', async () => {
    user.totpEnabled = false;
    const result = await caller().api.totpSetup({ password });
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(changeTotpState).toHaveBeenCalledWith(user, { secret: result.secret, enabled: false, revokeSessions: false });
  });
  it('does not return a key if concurrent state changed', async () => {
    user.totpEnabled = false;
    vi.mocked(changeTotpState).mockResolvedValue(false);
    await expect(caller().api.totpSetup({ password })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('rejects disabling with a password but no valid authenticator code', async () => {
    const invalid = String((Number(code()) + 1) % 1000000).padStart(6, '0');
    await expect(caller().api.totpDisable({ password, code: invalid })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
  it('rejects a stale authenticated session', async () => {
    await expect(caller({ sessionVersion: 6 }).api.totpDisable({ password, code: code() })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
  it('atomically clears MFA and revokes old sessions after both proofs', async () => {
    const { api, headers } = caller();
    await expect(api.totpDisable({ password, code: code() })).resolves.toEqual({ success: true });
    expect(changeTotpState).toHaveBeenCalledWith(user, { secret: null, enabled: false, revokeSessions: true });
    expect(headers.get('set-cookie')).toContain('HttpOnly');
  });
  it('confirms the exact pending key and renews the current session', async () => {
    user.totpEnabled = false;
    const { api, headers } = caller();
    await expect(api.totpConfirm({ code: code() })).resolves.toEqual({ success: true });
    expect(changeTotpState).toHaveBeenCalledWith(user, { secret, enabled: true, revokeSessions: true });
    expect(headers.get('set-cookie')).toContain('HttpOnly');
  });
  it('does not issue a session after a stale confirmation', async () => {
    user.totpEnabled = false;
    vi.mocked(changeTotpState).mockResolvedValue(false);
    const { api, headers } = caller();
    await expect(api.totpConfirm({ code: code() })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(headers.has('set-cookie')).toBe(false);
  });
  it('bounds repeated MFA guesses', async () => {
    const { api } = caller();
    for (let attempt = 0; attempt < 8; attempt++) {
      await expect(api.totpDisable({ password: 'wrong', code: '000000' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    await expect(api.totpDisable({ password, code: code() })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(changeTotpState).not.toHaveBeenCalled();
  });
});
