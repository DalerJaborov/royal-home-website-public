import { Link } from './LocalizedLink';
import { useLocale } from '@/hooks/useLocale';

const COPY = {
  ru: {
    heading: 'Как выбрать квартиру в Душанбе',
    intro: 'В каталоге ROYAL HOME собраны предложения агентства. Сравнивайте конкретные квартиры: одинаковое число комнат или название района ещё не означает одинаковые условия покупки.',
    steps: [
      'Задайте бюджет, площадь и число комнат. Сравните полную цену и цену за м², учитывая состояние и будущие расходы на ремонт.',
      'Откройте карточку: посмотрите фотографии, этаж и этажность, ремонт и стадию строительства. Если сведений нет, уточните их перед просмотром.',
      'Проверьте маршрут и сам дом: воду, лифт, отопление, шум и доступ в подъезд. Эти условия нельзя достоверно определить по названию района.',
      'Перед оплатой обсудите документы продавца, условия расчётов и вознаграждение агентства. Юридические особенности конкретной сделки уточните с нотариусом или профильным специалистом.',
    ],
    viewing: 'Обсудить подбор и просмотр', seller: 'Нужно продать свою квартиру?',
  },
  tg: {
    heading: 'Чӣ гуна дар Душанбе хона интихоб кардан мумкин аст',
    intro: 'Дар феҳристи ROYAL HOME пешниҳодҳои агентӣ ҷамъ шудаанд. Хонаҳои мушаххасро муқоиса кунед: шумораи якхелаи ҳуҷраҳо ё номи ноҳия маънои якхела будани шартҳои харидро надорад.',
    steps: [
      'Буҷа, масоҳат ва шумораи ҳуҷраҳоро муайян кунед. Нархи умумӣ ва нархи як м²-ро бо дарназардошти ҳолати хона ва хароҷоти ояндаи таъмир муқоиса намоед.',
      'Эълонро кушоед: аксҳо, ошёна, шумораи ошёнаҳои бино, таъмир ва марҳилаи сохтмонро бинед. Маълумоти норасидаро пеш аз боздид пурсед.',
      'Роҳ ва худи биноро санҷед: об, лифт, гармидиҳӣ, садо ва даромад ба бино. Ин шароитро танҳо аз номи ноҳия муайян кардан мумкин нест.',
      'Пеш аз пардохт ҳуҷҷатҳои фурӯшанда, тартиби ҳисоббаробаркунӣ ва ҳаққи хизмати агентиро баррасӣ кунед. Ҷузъиёти ҳуқуқии муомилаи мушаххасро бо нотариус ё мутахассиси дахлдор дақиқ намоед.',
    ],
    viewing: 'Муҳокимаи интихоб ва боздид', seller: 'Хонаи худро фурӯхтан мехоҳед?',
  },
  en: {
    heading: 'How to choose an apartment in Dushanbe',
    intro: 'The ROYAL HOME catalog contains the agency’s property offers. Compare individual apartments: the same room count or district name does not mean the same purchase terms.',
    steps: [
      'Set your budget, area and room count. Compare the total asking price and price per m², allowing for condition and future renovation costs.',
      'Open the listing to check photos, floor, building height, condition and construction stage. Ask about missing details before a viewing.',
      'Check your route and the building itself: water, lift, heating, noise and entrance access. The district name alone cannot establish these conditions.',
      'Before paying, discuss the seller’s documents, payment terms and agency fees. Check the legal details of the particular transaction with a notary or an appropriate specialist.',
    ],
    viewing: 'Discuss your search and a viewing', seller: 'Need to sell your apartment?',
  },
} as const;

export default function CatalogBuyingGuide() {
  const { locale } = useLocale();
  const copy = COPY[locale];
  return <section className="mt-10 mb-8 max-w-3xl border-t border-gray-200 pt-8">
    <h2 className="text-xl font-bold text-gray-900">{copy.heading}</h2>
    <p className="mt-4 text-sm leading-relaxed text-gray-600">{copy.intro}</p>
    <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-gray-600">
      {copy.steps.map(step => <li key={step}>{step}</li>)}
    </ol>
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-emerald-800">
      <Link to="/contacts" className="py-2 underline underline-offset-4">{copy.viewing}</Link>
      <Link to="/sell" className="py-2 underline underline-offset-4">{copy.seller}</Link>
    </div>
  </section>;
}
