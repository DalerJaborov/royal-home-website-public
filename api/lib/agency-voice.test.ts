import { describe, expect, it } from "vitest";
import { findFirstPersonHits } from "./agency-voice";

describe("поиск первого лица", () => {
  it("находит «я» и «мне» в тексте статьи", () => {
    const text = "<p>Клиенты задают мне один и тот же вопрос. Я работаю на рынке давно.</p>";
    expect(findFirstPersonHits(text).map((h) => h.toLowerCase())).toEqual(["мне", "я"]);
  });

  it("находит притяжательные формы", () => {
    expect(findFirstPersonHits("это мой опыт и моя оценка")).toHaveLength(2);
  });

  // Ради этого регулярка написана с ручными границами слова: `\b` в JS считает
  // буквой только латиницу, поэтому «мне» нашлось бы внутри «мнение».
  it("не считает первым лицом слова, внутри которых есть «мне» или «я»", () => {
    const text = "Наше мнение: земля, армия, семья, помнить, имя, статья, комнате, изменения";
    expect(findFirstPersonHits(text)).toEqual([]);
  });

  it("голос агентства проходит проверку чистым", () => {
    const text = "<p>К нам обращаются каждый день. Мы работаем на рынке давно, наша база — 35 объектов.</p>";
    expect(findFirstPersonHits(text)).toEqual([]);
  });
});
