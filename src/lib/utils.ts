import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * tRPC surfaces Zod input-validation failures as a JSON-stringified array of
 * issues in `error.message` (no custom errorFormatter is configured). Unwrap
 * that into a plain, user-facing string; fall back to the raw message otherwise.
 */
export function getTrpcErrorMessage(message: string, fallback: string, translate: (source: string) => string = source => source, fallbackOnUntranslated = false): string {
  const friendly = (value: string) => {
    if (value.length > 500 || /(?:SQL|Zod|TRPC|SyntaxError|TypeError|ECONN|INTERNAL_SERVER_ERROR|<!DOCTYPE|<html|stack trace)/i.test(value)) return translate(fallback);
    const translated = translate(value);
    return fallbackOnUntranslated && translated === value ? translate(fallback) : translated;
  };
  try {
    const issues = JSON.parse(message)
    if (Array.isArray(issues)) {
      const texts = issues.slice(0, 6).flatMap(issue => issue && typeof issue.message === 'string' ? [friendly(issue.message)] : []);
      return [...new Set(texts)].join(' ') || translate(fallback);
    }
    return translate(fallback);
  } catch {
    // not a Zod issues payload — fall through
  }
  return message ? friendly(message) : translate(fallback)
}
