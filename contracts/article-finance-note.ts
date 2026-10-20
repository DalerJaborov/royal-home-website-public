export const ARTICLE_FINANCE_NOTE = 'Условия банков меняются. Ставки и примеры в статье не заменяют актуальный тариф: уточняйте условия напрямую в выбранном банке.';

export function isFinancialArticle(title: string, category: string | null = ''): boolean {
  return /ипотек|кредит|рассроч|(?:^|[^а-яё])ставк|mortgag|credit|loan|installment|interest rate|қарз|тақсит|қисм-қисм/i.test(`${title} ${category ?? ''}`);
}
