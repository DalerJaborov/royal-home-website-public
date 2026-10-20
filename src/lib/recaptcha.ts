// Loads Google reCAPTCHA v3 once and fetches a fresh token per submission.
// v3 is invisible — no checkbox, no puzzle — so this never interrupts a
// real visitor filling out a form.
declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (!SITE_KEY) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    if (document.querySelector('script[data-recaptcha]')) return resolve();
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.dataset.recaptcha = 'true';
    script.onload = () => resolve();
    script.onerror = () => resolve(); // don't block form submission on a CDN hiccup
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Best-effort: returns undefined if reCAPTCHA isn't configured or fails to
// load — the server falls back to the honeypot + timing check in that case.
export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  await loadScript();
  if (!window.grecaptcha) return undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window.grecaptcha!.execute(SITE_KEY, { action }).then(resolve).catch(reject);
      });
    });
  } catch {
    return undefined;
  }
}
