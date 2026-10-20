import { describe, expect, it } from "vitest";
import { dushanbeStartOf } from "./analytics";

/**
 * Границы суток в аналитике — по Душанбе, а не по часовому поясу процесса.
 *
 * Находка аудита 09.08.2026: контейнер живёт в UTC, а `new Date(год, месяц, день)`
 * берёт полночь ЕГО пояса. «Сегодня» в отчётах начиналось в 05:00 по Душанбе —
 * визиты с полуночи до пяти утра попадали во «вчера»: утренняя цифра занижена,
 * вчерашняя завышена. Тесты идут в UTC-контейнере, то есть воспроизводят ровно
 * ту среду, где ошибка и жила.
 */

/** 3 августа 2026, 01:30 по Душанбе — это 2 августа 20:30 UTC. */
const NIGHT_IN_DUSHANBE = new Date("2026-08-02T20:30:00Z");

describe("Сутки начинаются в полночь по Душанбе", () => {
  it("час ночи по Душанбе относится к ТЕКУЩЕМУ дню, а не к вчерашнему", () => {
    const start = dushanbeStartOf("day", NIGHT_IN_DUSHANBE);
    // Полночь 3 августа по Душанбе = 2 августа 19:00 UTC.
    expect(start.toISOString()).toBe("2026-08-02T19:00:00.000Z");
    // Момент попадает внутрь суток, а не до их начала — это и было сломано.
    expect(NIGHT_IN_DUSHANBE.getTime()).toBeGreaterThanOrEqual(start.getTime());
  });

  it("день по Душанбе длится ровно сутки", () => {
    const start = dushanbeStartOf("day", NIGHT_IN_DUSHANBE);
    const next = dushanbeStartOf("day", new Date(start.getTime() + 24 * 60 * 60 * 1000));
    expect(next.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("месяц начинается в полночь первого числа по Душанбе", () => {
    // 1 августа 02:00 по Душанбе = 31 июля 21:00 UTC: по UTC ещё июль,
    // по Душанбе — уже август, и месяц должен считаться августовским.
    const start = dushanbeStartOf("month", new Date("2026-07-31T21:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-31T19:00:00.000Z");
  });

  it("год начинается в полночь 1 января по Душанбе", () => {
    // 1 января 2026, 03:00 по Душанбе = 31 декабря 2025, 22:00 UTC.
    const start = dushanbeStartOf("year", new Date("2025-12-31T22:00:00Z"));
    expect(start.toISOString()).toBe("2025-12-31T19:00:00.000Z");
  });
});
