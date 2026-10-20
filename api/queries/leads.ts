import { desc, eq } from "drizzle-orm";
import { getDb, isDbAvailable } from "./connection";
import { leads } from "@db/schema";
import {
  memoryCreateLead,
  memoryFindAllLeads,
  memoryUpdateLeadStatus,
  memorySetLeadCrmClientId,
  memoryFindLeadByCrmClientId,
} from "./memory-store";

export async function createLead(data: {
  name?: string;
  phone: string;
  message?: string;
  source: string;
}) {
  if (!isDbAvailable()) {
    return memoryCreateLead(data);
  }

  const db = getDb()!;
  const [result] = await db.insert(leads).values({
    name: data.name,
    phone: data.phone,
    message: data.message,
    source: data.source,
  });
  return result.insertId;
}

/** Заявки копятся вечно и не чистятся: без предела выборки список в админке
 *  однажды начнёт тянуть в память всю историю обращений. Свежие сверху, поэтому
 *  предел режет ровно хвост, который в админке и не листают. */
const ADMIN_LIST_LIMIT = 500;

export async function findAllLeads() {
  if (!isDbAvailable()) {
    return (await memoryFindAllLeads()).slice(0, ADMIN_LIST_LIMIT);
  }

  const db = getDb()!;
  return db.select().from(leads).orderBy(desc(leads.createdAt)).limit(ADMIN_LIST_LIMIT);
}

export async function updateLeadStatus(id: number, status: "new" | "contacted" | "closed") {
  if (!isDbAvailable()) {
    return memoryUpdateLeadStatus(id, status);
  }

  const db = getDb()!;
  await db.update(leads).set({ status }).where(eq(leads.id, id));
}

export async function findLeadById(id: number) {
  if (!isDbAvailable()) {
    return memoryFindAllLeads().find((l) => l.id === id) ?? null;
  }

  const db = getDb()!;
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

/** Записывает id клиента в CRM, которому переслана эта заявка (api/lib/crm.ts) —
 * связь нужна, чтобы потом синхронизировать статус в обе стороны. */
export async function setLeadCrmClientId(id: number, crmClientId: string) {
  if (!isDbAvailable()) {
    return memorySetLeadCrmClientId(id, crmClientId);
  }

  const db = getDb()!;
  await db.update(leads).set({ crmClientId }).where(eq(leads.id, id));
}

/** Статус меняют в CRM → находим соответствующую заявку сайта по crmClientId. */
export async function findLeadByCrmClientId(crmClientId: string) {
  if (!isDbAvailable()) {
    return memoryFindLeadByCrmClientId(crmClientId);
  }

  const db = getDb()!;
  const [row] = await db.select().from(leads).where(eq(leads.crmClientId, crmClientId)).limit(1);
  return row ?? null;
}

/** Применяет статус, пришедший из CRM, — напрямую, без вызова forwardStatusToCrm
 * (иначе это тут же ушло бы обратно в CRM и получился бы бесконечный цикл). */
export async function applyStatusFromCrm(id: number, status: "new" | "contacted" | "closed") {
  return updateLeadStatus(id, status);
}
