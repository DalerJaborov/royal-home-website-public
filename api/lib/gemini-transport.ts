/**
 * Как сайт дозванивается до Gemini: адрес и заголовки прокси.
 *
 * Отдельным модулем, потому что потребителей стало двое — генератор текста статьи
 * (blog-generator.ts) и генератор обложки (blog-cover.ts). Разойтись им нельзя:
 * если прокси настроен, через него обязаны идти ВСЕ запросы, иначе часть функций
 * молча упрётся в геоблок, а часть будет работать — и причину будут искать в
 * логике, а не в маршруте. Ровно по этой причине то же самое вынесено отдельным
 * файлом в CRM (apps/api/src/ai/geminiTransport.ts).
 *
 * ГЕОБЛОК. Прямой запрос из Душанбе получает 400 «User location is not supported
 * for the API use» — ключ и модель при этом исправны. Закрывается тем же
 * Cloudflare Worker, что проксирует Instagram: маршрут `/gemini/*`, доступ по
 * заголовку `x-proxy-key`. Значения GEMINI_PROXY_URL / GEMINI_PROXY_KEY берутся
 * из `.env.production`; без них ходим напрямую — на своей машине это удобно, на
 * боевом сервере откажет с понятным текстом, а не молча.
 *
 * ВАЖНО: маршрут `/gemini/*` у Worker обязан пропускать не только `/v1beta/*`,
 * но и `/upload/v1beta/*` — иначе загрузка файлов отвалится, а текст продолжит
 * работать, и причину будут искать в логике вместо маршрута.
 */

const GEMINI_HOST = "https://generativelanguage.googleapis.com";

/**
 * Полный адрес запроса к Gemini.
 * @param path путь от корня API, начиная со слэша: "/v1beta/models/...:generateContent".
 */
export function geminiUrl(path: string): string {
  // `||`, а не `??`: пустая строка в .env — это «не настроено», а не адрес.
  const proxy = process.env.GEMINI_PROXY_URL || "";
  return proxy ? `${proxy.replace(/\/+$/, "")}/gemini${path}` : `${GEMINI_HOST}${path}`;
}

/** Заголовок доступа к прокси. Пустой объект, когда прокси не настроен. */
export function geminiProxyHeaders(): Record<string, string> {
  const key = process.env.GEMINI_PROXY_KEY || "";
  return key ? { "x-proxy-key": key } : {};
}

/** Настроен ли прокси (для диагностики в админке и в сообщениях об ошибках). */
export function isGeminiProxyConfigured(): boolean {
  return Boolean(process.env.GEMINI_PROXY_URL && process.env.GEMINI_PROXY_KEY);
}
