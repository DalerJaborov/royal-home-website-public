/**
 * Освежить цифры в вышедших статьях, не переписывая их заново.
 *
 * То же самое делает планировщик раз в час (одну статью за проход, только если
 * новую на этой неделе уже написали), но иногда нужно руками: например, после
 * большого пополнения каталога.
 *
 * Запуск на боевом сервере:
 *   docker compose -f docker-compose.prod.yml exec app node dist/refresh-articles.js --dry-run
 *   docker compose -f docker-compose.prod.yml exec app node dist/refresh-articles.js --limit=3
 *
 * Ключи: --dry-run, --limit=N (по умолчанию 1), --older-than=N дней (по умолчанию 90).
 */
import { refreshStaleArticles } from "../blog-generator";

const args = process.argv.slice(2);
const num = (flag: string, fallback: number) => {
  const raw = args.find((a) => a.startsWith(`${flag}=`))?.split("=")[1];
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : fallback;
};

async function main() {
  const report = await refreshStaleArticles({
    days: num("--older-than", 90),
    limit: num("--limit", 1),
    dryRun: args.includes("--dry-run"),
  });

  console.log(`[refresh-articles] Статей старше срока: ${report.checked}`);
  for (const a of report.refreshed) console.log(`  обновлена #${a.id} «${a.title}»`);
  for (const s of report.skipped) console.log(`  пропущена #${s.id} «${s.title}» — ${s.why}`);
  if (!report.refreshed.length && !report.skipped.length) console.log("  обновлять нечего");
  // Пул соединений с БД держит процесс живым — уходим сами.
  process.exit(0);
}

main().catch((e) => {
  console.error("[refresh-articles] Прогон сорвался:", e instanceof Error ? e.message : e);
  process.exit(1);
});
