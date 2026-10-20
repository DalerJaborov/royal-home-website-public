import { afterEach, describe, expect, it } from "vitest";
import { buildCoverPrompt } from "./blog-cover";
import { geminiUrl, geminiProxyHeaders, isGeminiProxyConfigured } from "./gemini-transport";

const ORIGINAL_URL = process.env.GEMINI_PROXY_URL;
const ORIGINAL_KEY = process.env.GEMINI_PROXY_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("GEMINI_PROXY_URL", ORIGINAL_URL);
  restore("GEMINI_PROXY_KEY", ORIGINAL_KEY);
});

describe("адрес Gemini", () => {
  it("без прокси идёт напрямую в Google", () => {
    delete process.env.GEMINI_PROXY_URL;
    expect(geminiUrl("/v1beta/models/x:generateContent")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/x:generateContent"
    );
  });

  it("с прокси подставляет маршрут /gemini и не удваивает слэш", () => {
    process.env.GEMINI_PROXY_URL = "https://worker.example.dev/";
    expect(geminiUrl("/v1beta/models/x:generateContent")).toBe(
      "https://worker.example.dev/gemini/v1beta/models/x:generateContent"
    );
  });

  it("пустая переменная — это «не настроено», а не адрес", () => {
    process.env.GEMINI_PROXY_URL = "";
    process.env.GEMINI_PROXY_KEY = "";
    expect(geminiUrl("/v1beta/models")).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(geminiProxyHeaders()).toEqual({});
    expect(isGeminiProxyConfigured()).toBe(false);
  });

  it("ключ прокси уходит заголовком x-proxy-key", () => {
    process.env.GEMINI_PROXY_URL = "https://worker.example.dev";
    process.env.GEMINI_PROXY_KEY = "secret";
    expect(geminiProxyHeaders()).toEqual({ "x-proxy-key": "secret" });
    expect(isGeminiProxyConfigured()).toBe(true);
  });
});

describe("промт обложки", () => {
  const rules = /no text, no letters/i;

  it("берёт сцену, описанную автором статьи", () => {
    const prompt = buildCoverPrompt({
      title: "Цены на однушки в Сино",
      excerpt: "Разбор рынка",
      imagePrompt: "A still life of moving boxes and a single key in soft daylight",
    });
    expect(prompt).toContain("A still life of moving boxes and a single key in soft daylight");
    expect(prompt).toMatch(rules);
  });

  it("без сцены строит промт по заголовку и описанию", () => {
    const prompt = buildCoverPrompt({ title: "Ипотека в Душанбе", excerpt: "Условия банков" });
    expect(prompt).toContain("Ипотека в Душанбе");
    expect(prompt).toContain("Условия банков");
    expect(prompt).toMatch(rules);
  });

  it("пустая сцена не считается сценой", () => {
    const prompt = buildCoverPrompt({ title: "Новостройки", imagePrompt: "   " });
    expect(prompt).toContain("Новостройки");
  });
  it("не передаёт старую выдуманную городскую сцену в промпт художнику", () => {
    const prompt = buildCoverPrompt({ title: "Переезд", imagePrompt: "Aerial view of a residential district at golden hour" });
    expect(prompt).not.toContain("Aerial view of a residential district at golden hour");
    expect(prompt).toContain("neutral editorial illustration");
  });

  // Граница, ради которой всё и написано: обложка не должна выдавать себя за
  // фотографию конкретной квартиры из каталога.
  it("всегда запрещает выдавать картинку за фото объекта", () => {
    const prompt = buildCoverPrompt({ title: "Что угодно" });
    expect(prompt).toMatch(/do not stage it as a listing photo/i);
  });
});
