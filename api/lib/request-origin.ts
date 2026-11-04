import { env } from './env';

/** SameSite cookies also travel from sibling subdomains. Check the exact origin. */
export function isTrustedMutationRequest(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return true;
  const origin = req.headers.get('origin');
  if (origin) {
    const allowed = env.isProduction
      ? ['https://royalhome.tj', 'https://www.royalhome.tj']
      : [new URL(req.url).origin];
    return allowed.includes(origin);
  }
  // Non-browser JSON clients may omit Origin; browser cross-site requests may not.
  const site = req.headers.get('sec-fetch-site');
  return site !== 'cross-site' && site !== 'same-site';
}
