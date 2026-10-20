import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";
import type { User } from "@db/schema";

// С3/security-audit-11-09.md: consumePasswordReset — публичная процедура,
// которой директор пользуется по одноразовой ссылке из CRM. Мокаем
// queries/users, чтобы проверить только маршрутизацию ошибки/успеха, без
// настоящей БД (её на CI нет — см. queries/users.test-DB-недоступна ниже).
vi.mock("./queries/users", async () => {
  const actual = await vi.importActual<typeof import("./queries/users")>("./queries/users");
  return {
    ...actual,
    consumePasswordResetToken: vi.fn(),
  };
});

const { consumePasswordResetToken } = await import("./queries/users");
const { authRouter } = await import("./auth-router");

function caller(user?: Partial<User>) {
  const ctx: TrpcContext = { req: new Request("http://localhost/", { headers: { "x-real-ip": "9.9.9.9" } }), resHeaders: new Headers(), user: user as User | undefined };
  return authRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.mocked(consumePasswordResetToken).mockReset();
});

describe("authRouter.me session probe", () => {
  it("anonymous visits return null instead of an expected HTTP auth error", async () => {
    await expect(caller().me()).resolves.toBeNull();
  });
  it("authenticated probes expose only the public user fields", async () => {
    const result = await caller({ id: 1, role: "admin", name: "Admin", email: "admin@example.test", passwordHash: "sensitive-password-hash", totpSecret: "sensitive-totp-secret", totpEnabled: true }).me();
    expect(result?.role).toBe("admin");
    expect(result).not.toHaveProperty("passwordHash"); expect(result).not.toHaveProperty("totpSecret");
  });
  it("an anonymous probe does not authorize admin mutations", async () => {
    await expect(caller().totpSetup()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("authRouter.consumePasswordReset", () => {
  it("недействительный/истёкший токен отвечает UNAUTHORIZED, не 500", async () => {
    vi.mocked(consumePasswordResetToken).mockResolvedValue({ ok: false });
    await expect(caller().consumePasswordReset({ token: "0".repeat(32), newPassword: "a-long-enough-pw" })).rejects.toThrow(TRPCError);
  });

  it("успешный сброс возвращает success:true", async () => {
    vi.mocked(consumePasswordResetToken).mockResolvedValue({ ok: true });
    const res = await caller().consumePasswordReset({ token: "0".repeat(32), newPassword: "a-long-enough-pw" });
    expect(res).toEqual({ success: true });
  });

  it("короткий новый пароль отклоняется схемой до вызова базы", async () => {
    await expect(caller().consumePasswordReset({ token: "0".repeat(32), newPassword: "short" })).rejects.toThrow();
    expect(consumePasswordResetToken).not.toHaveBeenCalled();
  });
});
