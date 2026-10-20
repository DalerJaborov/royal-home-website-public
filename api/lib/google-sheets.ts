import { google } from "googleapis";

// Column order for the "Объекты" export/import sheet. `id` is the anchor for
// import: present + matches an existing listing -> update; blank -> create.
const COLUMNS = [
  "id",
  "title",
  "location",
  "price",
  "rooms",
  "area",
  "floor",
  "totalFloors",
  "type",
  "stage",
  "repair",
  "urgent",
  "sold",
  "photos",
  "description",
  "mapAddress",
] as const;

function isConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 && process.env.GOOGLE_SHEETS_ID);
}

// gaxios (клиент, на котором держится googleapis) не ставит таймаут сама по
// себе — без него зависшая раздача Google API вешает импорт/экспорт навсегда,
// а не только на разумный срок ожидания.
const SHEETS_REQUEST_TIMEOUT_MS = 20_000;

type SheetsClient = Awaited<ReturnType<typeof getSheetsClient>>;

/** Имя первой вкладки таблицы — код не привязан к конкретному названию
 * («Лист1»/«Sheet1»/любому), берём первую вкладку как есть. */
async function firstSheetName(sheets: SheetsClient, spreadsheetId: string): Promise<string> {
  const meta = await sheets.spreadsheets.get(
    { spreadsheetId, fields: "sheets.properties.title" },
    { timeout: SHEETS_REQUEST_TIMEOUT_MS }
  );
  const name = meta.data.sheets?.[0]?.properties?.title;
  if (!name) throw new Error("В таблице нет ни одной вкладки");
  return name;
}

/** A1-нотация с экранированием имени вкладки (пробелы/кавычки требуют кавычек). */
function sheetRange(name: string, a1: string): string {
  return `'${name.replace(/'/g, "''")}'!${a1}`;
}

async function getSheetsClient() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 не задан");
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

export type SheetListingRow = {
  id?: number;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor?: string;
  totalFloors?: number;
  type?: string;
  stage?: string;
  repair?: string;
  urgent?: boolean;
  sold?: boolean;
  imageUrls?: string[];
  description?: string;
  mapAddress?: string;
};

// Listings as read back from the DB/memory store have nullable columns
// (Drizzle selects `null`, not `undefined`), unlike SheetListingRow which
// models sheet-parsed rows where a blank cell is `undefined`. Export accepts
// either — every field is read through `?? ""` below anyway.
type ExportableListing = {
  id: number;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  floor?: string | null;
  totalFloors?: number | null;
  type?: string | null;
  stage?: string | null;
  repair?: string | null;
  urgent?: boolean | null;
  sold?: boolean | null;
  imageUrls?: string[] | null;
  description?: string | null;
  mapAddress?: string | null;
};

export async function exportListingsToSheet(listingsData: ExportableListing[]) {
  if (!isConfigured()) throw new Error("Google Sheets не подключён (см. .env)");
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const sheetName = await firstSheetName(sheets, spreadsheetId);

  const rows: (string | number)[][] = [
    [...COLUMNS],
    ...listingsData.map((l) => [
      l.id ?? "",
      l.title,
      l.location,
      l.price,
      l.rooms,
      l.area,
      l.floor ?? "",
      l.totalFloors ?? "",
      l.type ?? "",
      l.stage ?? "",
      l.repair ?? "",
      l.urgent ? "TRUE" : "FALSE",
      l.sold ? "TRUE" : "FALSE",
      (l.imageUrls ?? []).join(", "),
      l.description ?? "",
      l.mapAddress ?? "",
    ]),
  ];

  await sheets.spreadsheets.values.clear(
    { spreadsheetId, range: sheetRange(sheetName, "A:P") },
    { timeout: SHEETS_REQUEST_TIMEOUT_MS }
  );
  await sheets.spreadsheets.values.update(
    {
      spreadsheetId,
      range: sheetRange(sheetName, "A1"),
      valueInputOption: "RAW",
      requestBody: { values: rows },
    },
    { timeout: SHEETS_REQUEST_TIMEOUT_MS }
  );

  return { count: listingsData.length };
}

export async function importListingsFromSheet(): Promise<SheetListingRow[]> {
  if (!isConfigured()) throw new Error("Google Sheets не подключён (см. .env)");
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  const sheetName = await firstSheetName(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get(
    { spreadsheetId, range: sheetRange(sheetName, "A:P") },
    { timeout: SHEETS_REQUEST_TIMEOUT_MS }
  );
  const rows = res.data.values ?? [];
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => String(h).trim());
  const colIndex = (name: string) => header.indexOf(name);

  const get = (row: string[], name: string) => {
    const i = colIndex(name);
    return i === -1 ? undefined : row[i];
  };

  return rows.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const idRaw = get(row, "id");
      const priceRaw = get(row, "price");
      const roomsRaw = get(row, "rooms");
      const areaRaw = get(row, "area");
      const totalFloorsRaw = get(row, "totalFloors");
      const photosRaw = get(row, "photos");

      return {
        id: idRaw && String(idRaw).trim() !== "" ? Number(idRaw) : undefined,
        title: String(get(row, "title") ?? "").trim(),
        location: String(get(row, "location") ?? "").trim(),
        price: Number(priceRaw ?? 0),
        rooms: Number(roomsRaw ?? 0),
        area: Number(areaRaw ?? 0),
        floor: get(row, "floor") || undefined,
        totalFloors: totalFloorsRaw ? Number(totalFloorsRaw) : undefined,
        type: get(row, "type") || undefined,
        stage: get(row, "stage") || undefined,
        repair: get(row, "repair") || undefined,
        urgent: String(get(row, "urgent") ?? "").toUpperCase() === "TRUE",
        sold: String(get(row, "sold") ?? "").toUpperCase() === "TRUE",
        imageUrls: photosRaw
          ? String(photosRaw).split(",").map((u) => u.trim()).filter(Boolean)
          : undefined,
        description: get(row, "description") || undefined,
        mapAddress: get(row, "mapAddress") || undefined,
      } satisfies SheetListingRow;
    })
    .filter((l) => l.title && l.location);
}
