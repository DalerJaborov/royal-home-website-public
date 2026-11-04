import { afterEach, describe, expect, it } from 'vitest';
import { env } from './env';
import { isTrustedMutationRequest } from './request-origin';
const production = env.isProduction;
afterEach(() => { env.isProduction = production; });
const request = (headers: Record<string, string>, method = 'POST') => new Request('http://localhost:3000/api/trpc/auth.logout', { method, headers });
describe('mutation origin boundary', () => {
  it.each(['https://evil.test', 'https://crm.royalhome.tj', 'https://royalhome.tj.evil.test', 'null', 'http://royalhome.tj'])('rejects %s in production', origin => {
    env.isProduction = true;
    expect(isTrustedMutationRequest(request({ origin }))).toBe(false);
  });
  it.each(['https://royalhome.tj', 'https://www.royalhome.tj'])('permits canonical browser origin %s behind HTTP proxy', origin => {
    env.isProduction = true;
    expect(isTrustedMutationRequest(request({ origin }))).toBe(true);
  });
  it('rejects browser cross-site and sibling-site requests without Origin', () => {
    expect(isTrustedMutationRequest(request({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isTrustedMutationRequest(request({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });
  it('preserves non-browser JSON clients and public reads', () => {
    expect(isTrustedMutationRequest(request({}))).toBe(true);
    expect(isTrustedMutationRequest(request({ origin: 'https://evil.test' }, 'GET'))).toBe(true);
  });
  it('allows exact development origin only', () => {
    env.isProduction = false;
    expect(isTrustedMutationRequest(request({ origin: 'http://localhost:3000' }))).toBe(true);
    expect(isTrustedMutationRequest(request({ origin: 'http://localhost:4000' }))).toBe(false);
  });
});
