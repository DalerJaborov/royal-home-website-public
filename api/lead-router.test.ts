import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createLead: vi.fn().mockResolvedValue(10), forwardLeadToCrm: vi.fn().mockResolvedValue("crm-id"), setLeadCrmClientId: vi.fn(), verifyRecaptcha: vi.fn().mockResolvedValue(true) }));
vi.mock("./queries/leads", () => ({ ...mocks, findAllLeads: vi.fn(), findLeadById: vi.fn(), updateLeadStatus: vi.fn() }));
vi.mock("./lib/crm", () => ({ forwardLeadToCrm: mocks.forwardLeadToCrm, forwardStatusToCrm: vi.fn() }));
vi.mock("./lib/recaptcha", () => ({ verifyRecaptcha: mocks.verifyRecaptcha }));
vi.mock("./lib/rate-limit", () => ({ assertRateLimit: vi.fn(), clientIp: () => "127.0.0.1" }));
const queueMocks = vi.hoisted(() => ({ acceptQueuedLead: vi.fn().mockResolvedValue(10) }));
vi.mock('./queries/lead-deliveries', () => ({ ...queueMocks, leadDeliveryStatuses: vi.fn().mockResolvedValue([]), retryBlockedLeadDelivery: vi.fn(), leadDeliveryHealth: vi.fn().mockResolvedValue([]) }));
import { leadRouter } from "./lead-router";
const caller = () => leadRouter.createCaller({ req: new Request("http://localhost"), resHeaders: new Headers() });
beforeEach(() => vi.clearAllMocks());
describe("lead submission contract", () => {
  it('sanitizes acquisition fields and accepts a real lead with malformed optional tracking', async () => {
    await caller().create({ phone: '+992000000000', source: 'Контакты', attribution: { landingPath: '/tg/tamos', utmSource: 'google', private: 'secret' } });
    expect(queueMocks.acceptQueuedLead.mock.calls[0][0].attribution).toEqual({ landingPath: '/contacts', utmSource: 'google' });
    await caller().create({ phone: '+992000000000', source: 'Контакты', attribution: 'broken' });
    expect(queueMocks.acceptQueuedLead.mock.calls[1][0].attribution).toBeUndefined();
  });
  it("rejects oversized sources before any write, matching the database100-character column", async () => {
    await expect(caller().create({ phone: "+992777776001", source: 'a'.repeat(101) })).rejects.toThrow();
    expect(mocks.createLead).not.toHaveBeenCalled();
    expect(mocks.forwardLeadToCrm).not.toHaveBeenCalled();
  });
  it("rejects six-digit phones before claiming successful CRM delivery", async () => {
    await expect(caller().create({ phone: "123456", source: "Контакты" })).rejects.toThrow();
    expect(mocks.createLead).not.toHaveBeenCalled(); expect(mocks.forwardLeadToCrm).not.toHaveBeenCalled();
  });
  it("persists real leads and links successful CRM delivery", async () => {
    await expect(caller().create({ name: "Далер", phone: "+992 777 77 60 01", source: "Контакты", formRenderedAt: Date.now() - 5000 })).resolves.toEqual({ id: 10, success: true });
    expect(queueMocks.acceptQueuedLead).toHaveBeenCalledOnce();
  });
  it("honeypots never persist or forward a lead", async () => {
    await expect(caller().create({ phone: "+992777776001", source: "Контакты", hp: "bot" })).resolves.toEqual({ id: 0, success: true });
    expect(mocks.createLead).not.toHaveBeenCalled(); expect(mocks.forwardLeadToCrm).not.toHaveBeenCalled();
    expect(mocks.verifyRecaptcha).not.toHaveBeenCalled();
  });
  it("failed CAPTCHA verification never claims a real lead was accepted", async () => {
    mocks.verifyRecaptcha.mockResolvedValueOnce(false);
    await expect(caller().create({ phone: "+992777776001", source: "Контакты" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createLead).not.toHaveBeenCalled(); expect(mocks.forwardLeadToCrm).not.toHaveBeenCalled();
  });
  it("client clock ahead of the server does not silently discard a genuine lead", async () => {
    await expect(caller().create({ phone: "+992777776001", source: "Контакты", formRenderedAt: Date.now() + 60000 })).resolves.toEqual({ id: 10, success: true });
  });
  it("fast submission offers retry instead of claiming the lead was saved", async () => {
    await expect(caller().create({ phone: "+992777776001", source: "Контакты", formRenderedAt: Date.now() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.createLead).not.toHaveBeenCalled();
  });
  it("CRM outage keeps a locally saved lead available for follow-up", async () => {
    mocks.forwardLeadToCrm.mockResolvedValueOnce(null);
    await expect(caller().create({ phone: "+992777776001", source: "Контакты" })).resolves.toEqual({ id: 10, success: true });
    expect(queueMocks.acceptQueuedLead).toHaveBeenCalledOnce(); expect(mocks.forwardLeadToCrm).not.toHaveBeenCalled();
  });
  it('does not claim acceptance when the atomic save fails', async () => {
    queueMocks.acceptQueuedLead.mockRejectedValueOnce(new Error('save failed'));
    await expect(caller().create({ phone: '+992000000000', source: 'isolated-test' })).rejects.toThrow('Не удалось сохранить заявку');
  });
  it('protects delivery health and retry controls behind admin authorization', async () => {
    await expect(caller().deliveryHealth()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller().retryDelivery({ id: 10 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
