import { describe, expect, it, vi, beforeEach } from "vitest";
import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import type { User } from "@db/schema";
vi.mock("../lib/env", () => ({ env: { appSecret: "isolated-test-secret-with-no-production-access", appId: "test", isProduction: false, databaseUrl: "", adminEmail: "admin@example.test" } }));

// С2/security-audit-11-09.md: 12-часовой токен с продлением при активности
// и отзыв по sessionVersion. Мокаем queries/users — тест проверяет только
// логику authenticateRequest, не настоящую БД (её на CI нет).
vi.mock("../queries/users", () => ({
  findUserByUnionId: vi.fn(),
  upsertUser: vi.fn(),
}));

const { findUserByUnionId } = await import("../queries/users");
const { authenticateRequest } = await import("./auth");
const { signSessionToken } = await import("./session");

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    unionId: "local-admin",
    name: "Администратор",
    email: "admin@royalhome.tj",
    passwordHash: null,
    avatar: null,
    role: "admin",
    totpSecret: null,
    totpEnabled: false,
    sessionVersion: 0,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    passwordResetClearsTotp: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignInAt: new Date(),
    ...overrides,
  } as User;
}

function headersWithCookie(token: string) {
  return new Headers({ cookie: cookie.serialize(Session.cookieName, token) });
}

beforeEach(() => {
  vi.mocked(findUserByUnionId).mockReset();
});

describe("authenticateRequest: отзыв по sessionVersion", () => {
  it("токен с устаревшим sessionVersion (после logout) отклоняется", async () => {
    const token = await signSessionToken({ unionId: "local-admin", clientId: "local", sessionVersion: 0 });
    vi.mocked(findUserByUnionId).mockResolvedValue(baseUser({ sessionVersion: 1 }));

    await expect(authenticateRequest(headersWithCookie(token))).rejects.toMatchObject({ status: 403 });
  });

  it("токен с текущим sessionVersion проходит", async () => {
    const token = await signSessionToken({ unionId: "local-admin", clientId: "local", sessionVersion: 2 });
    vi.mocked(findUserByUnionId).mockResolvedValue(baseUser({ sessionVersion: 2 }));

    const user = await authenticateRequest(headersWithCookie(token));
    expect(user.unionId).toBe("local-admin");
  });
});

describe("authenticateRequest: продление сессии при активности", () => {
  it("свежий токен не переиздаётся", async () => {
    const token = await signSessionToken({ unionId: "local-admin", clientId: "local", sessionVersion: 0 });
    vi.mocked(findUserByUnionId).mockResolvedValue(baseUser());

    const resHeaders = new Headers();
    await authenticateRequest(headersWithCookie(token), resHeaders);
    expect(resHeaders.get("set-cookie")).toBeNull();
  });

  it("токен старше порога продления переиздаётся новой cookie", async () => {
    vi.useFakeTimers();
    try {
      const token = await signSessionToken({ unionId: "local-admin", clientId: "local", sessionVersion: 0 });
      // Сдвигаем время вперёд за порог продления (maxAge - refreshThreshold),
      // но раньше истечения токена — ровно то окно, где должно сработать продление.
      vi.advanceTimersByTime(Session.maxAgeMs - Session.refreshThresholdMs + 1000);
      vi.mocked(findUserByUnionId).mockResolvedValue(baseUser());

      const resHeaders = new Headers();
      await authenticateRequest(headersWithCookie(token), resHeaders);
      const setCookie = resHeaders.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain(Session.cookieName);
    } finally {
      vi.useRealTimers();
    }
  });
});
