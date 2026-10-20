import { useEffect, useRef, useState } from 'react';
import { getRecaptchaToken } from '@/lib/recaptcha';

// Pairs with the server-side check in api/lead-router.ts: a honeypot field
// bots tend to auto-fill (real visitors never see it), a "too fast to be
// human" submit-time check, and (if configured) an invisible reCAPTCHA v3
// score. Call getAntiSpamFields() right before submitting and spread the
// result into the lead.create call; render <HoneypotField> inside the form.
export function useAntiSpam(action: string) {
  // Отметка времени ставится в эффекте, а не в теле хука: Date.now() — нечистый
  // вызов, и в рендере он выполнялся на КАЖДОМ проходе (useRef вычисляет аргумент
  // всегда, даже когда уже не использует). Момент монтирования формы — именно то,
  // что нужно серверной проверке «слишком быстро для человека».
  const renderedAt = useRef(0);
  useEffect(() => {
    renderedAt.current = Date.now();
  }, []);
  const [hp, setHp] = useState('');

  const getAntiSpamFields = async () => {
    const recaptchaToken = await getRecaptchaToken(action);
    return { hp, formRenderedAt: renderedAt.current, recaptchaToken };
  };

  return { hp, setHp, getAntiSpamFields };
}
