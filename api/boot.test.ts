import { describe, expect, it } from "vitest";
import app from "./boot";
app.get('/csp-nonce-probe', (c) => c.html('<main>Test</main>'));

// С6/security-audit-11-09.md: заголовки безопасности должны стоять на КАЖДОМ
// ответе, а не только там, где их проверяли глазами. Один запрос к
// несуществующему пути достаточен — middleware вешает их до роутинга.
describe("заголовки безопасности на каждом ответе", () => {
  it("выставлены X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP, CSP", async () => {
    const res = await app.request("/api/does-not-exist");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    const scripts = csp.split(';').find((part) => part.trim().startsWith('script-src ')) ?? '';
    expect(scripts).toContain('https://telegram.org');
    expect(scripts).toContain('https://static.cloudflareinsights.com');
    expect(scripts).toContain('https://www.google.com/recaptcha/');
    expect(scripts).toContain('https://www.gstatic.com/recaptcha/');
    // Meta Pixel hosts appear only when META_PIXEL_ID is set (see boot-meta-csp.test.ts).
    expect(csp).not.toContain('facebook');
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });
  it("HTML gets unique response nonces for Cloudflare without permitting arbitrary inline code", async () => {
    const first = await app.request('/csp-nonce-probe');
    const second = await app.request('/csp-nonce-probe');
    const getNonce = (response: Response) => response.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1];
    expect(getNonce(first)).toMatch(/^[A-Za-z0-9+/]{24}$/);
    expect(getNonce(first)).not.toEqual(getNonce(second));
    expect(first.headers.get('Content-Security-Policy')?.split(';')[1]).not.toContain("'unsafe-inline'");
  });
});
