export const translations = {
  ru: {
    siteName: 'ROYAL HOME',
    tagline: 'Агентство недвижимости',
    nav: { buy: 'Купить', services: 'Услуги', team: 'Наша команда', mortgage: 'Ипотека', about: 'О нас', contacts: 'Контакты', blog: 'Блог' },
    hero: { title: 'НАЙДИТЕ СВОЙ ИДЕАЛЬНЫЙ ДОМ', subtitle: 'Royal Home — надёжное агентство недвижимости в Душанбе. Проверенные квартиры, профессиональные риелторы, полное юридическое сопровождение.', search: 'Найти', counter: 'проверенных объектов в продаже' },
    services: { title: 'Наши услуги' },
    urgent: { title: 'Срочные объявления' },
    listings: { title: 'Купить квартиру в Душанбе', all: 'Все', new: 'Новостройки', secondary: 'Вторичка', sort: 'Сортировка', stage: 'Стадия', repair: 'Ремонт', photos: 'фото' },
    cta: { title: 'Найдём идеальный вариант недвижимости для вас!', subtitle: 'Оставьте заявку и наш риелтор подберёт для вас лучшие варианты квартир в Душанбе.', placeholder: '+992 (___) ___-___', button: 'Свяжитесь со мной', privacy: 'Нажимая на кнопку, я даю согласие на обработку персональных данных.' },
    mortgage: { title: 'Ипотека в Душанбе', subtitle: 'Рассчитайте примерный платёж и обсудите покупку жилья. Актуальные условия и решение по заявке уточняйте у банка.', calc: 'Рассчитать ипотеку', params: 'Параметры', price: 'Стоимость недвижимости', downpayment: 'Первоначальный взнос', term: 'Срок (лет)', loanAmount: 'Сумма кредита', apply: 'Оставить заявку', banks: 'Предложения банков', rate: 'Ставка', period: 'Срок', perMonth: 'с./мес.', select: 'Выбрать' },
    team: { title: 'Наша команда', showPhone: 'Показать телефон' },
    footer: { address: 'Наш адрес', headOffice: 'Головной офис:', about: 'О нас', services: 'Услуги', contact: 'Связь с нами', callCenter: 'Колл-центр', rights: '© 2025 Royal Home TJ' },
    blog: { title: 'Блог о недвижимости', subtitle: 'Полезные статьи о покупке, продаже и инвестициях в недвижимость Душанбе', readMore: 'Читать далее' },
    about: { title: 'О компании Royal Home', subtitle: 'Помогаем людям найти идеальное жильё в Душанбе — честно и с полным сопровождением.', experience: 'лет опыта', deals: 'успешных сделок', clients: 'довольных клиентов', agents: 'профессиональных риелторов' },
  },
} as const;

type DisplayStrings<T> = T extends string ? string : { [K in keyof T]: DisplayStrings<T[K]> };
export type Translations = DisplayStrings<typeof translations.ru>;
