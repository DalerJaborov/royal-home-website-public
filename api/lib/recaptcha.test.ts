import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const testEnv = vi.hoisted(() => ({ isProduction: false }));
vi.mock("./env", () => ({ env: testEnv }));

// С4/security-audit-11-09.md: пустой RECAPTCHA_SECRET_KEY на проде раньше
// означал "не настроено — не блокируем" и держал капчу выключенной молча.
// Теперь на проде без ключа заявки должны отклоняться, а вне прода —
// по-прежнему пропускаться (иначе форму не протестировать локально).
describe("verifyRecaptcha без ключа", () => {
  const originalSecret = process.env.RECAPTCHA_SECRET_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    testEnv.isProduction = false;
    delete process.env.RECAPTCHA_SECRET_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
    else process.env.RECAPTCHA_SECRET_KEY = originalSecret;
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it("на проде без ключа отклоняет (fail closed)", async () => {
    testEnv.isProduction = true;
    const { verifyRecaptcha } = await import("./recaptcha");
    await expect(verifyRecaptcha("any-token", "1.2.3.4")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("вне прода без ключа по-прежнему пропускает", async () => {
    testEnv.isProduction = false;
    const { verifyRecaptcha } = await import("./recaptcha");
    await expect(verifyRecaptcha(undefined, "1.2.3.4")).resolves.toBe(true);
  });

  it("отсутствующий токен не обходит настроенную капчу", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "isolated-test-secret";
    const { verifyRecaptcha } = await import("./recaptcha");
    await expect(verifyRecaptcha(undefined, "1.2.3.4")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("сбой Google предлагает повторить, не пропускает непроверенную заявку", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "isolated-test-secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    const { verifyRecaptcha } = await import("./recaptcha");
    await expect(verifyRecaptcha("test-token", "1.2.3.4")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("принимает только токен нужного домена, действия и оценки", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "isolated-test-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { verifyRecaptcha } = await import("./recaptcha");
    const valid = { success: true, score: 0.9, hostname: "royalhome.tj", action: "contact_lead" };
    for (const response of [valid, { ...valid, hostname: "attacker.test" }, { ...valid, action: "unrelated_action" }, { ...valid, score: 0.1 }]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response)));
    }
    await expect(verifyRecaptcha("test-token", "1.2.3.4")).resolves.toBe(true);
    for (let i = 0; i < 3; i++) await expect(verifyRecaptcha("test-token", "1.2.3.4")).resolves.toBe(false);
  });
});
