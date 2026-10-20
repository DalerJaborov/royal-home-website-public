import type { PublicLocale } from './public-i18n';

export const SELL_GUIDE: Record<PublicLocale, { title: string; sections: Array<{ title: string; text: string }>; buyout: string; contacts: string }> = {
  ru: {
    title: 'Что подготовить к продаже недвижимости',
    sections: [
      { title: 'Продажа через агентство и срочный выкуп', text: 'При продаже через агентство обсуждаются предложение, поиск покупателя и показы. Выкуп — отдельный вариант: возможность и цена рассматриваются по конкретному объекту. Отправка заявки не означает обязательство агентства выкупить недвижимость или продать её к определённой дате.' },
      { title: 'Какие сведения указать в обращении', text: 'Форма принимает обращения по квартире, дому, коммерческому объекту или участку. Укажите адрес, площадь, этаж и этажность, состояние, ожидаемую цену и желаемый срок продажи. Подготовьте актуальные фотографии и сообщите, когда возможен просмотр. Для первичного разговора достаточно описать объект и свою задачу.' },
      { title: 'Как обсуждать цену', text: 'Сравнивайте предложения похожей площади, расположения и состояния. Цена объявления отличается от согласованной цены сделки. Предварительное обсуждение по телефону не заменяет осмотр; итоговые условия зависят от конкретного объекта, документов и договорённости сторон.' },
      { title: 'Что согласовать до начала работы', text: 'Уточните состав услуг, вознаграждение и расходы, порядок размещения объявления и показов. Сообщите об особенностях документов и участии представителей. Перечень документов и порядок оформления нужно определить для вашей ситуации, а согласованные условия работы зафиксировать письменно.' },
    ], buyout: 'Обсудить возможность выкупа', contacts: 'Связаться с ROYAL HOME',
  },
  tg: {
    title: 'Барои фурӯши амвол чӣ омода кардан лозим',
    sections: [
      { title: 'Фурӯш тавассути агентӣ ва хариди фаврӣ', text: 'Ҳангоми фурӯш тавассути агентӣ пешниҳод, ҷустуҷӯи харидор ва боздидҳоро муҳокима мекунанд. Хариди фаврӣ имкони ҷудогона аст: дастрасӣ ва нархи он барои объекти мушаххас баррасӣ мешаванд. Дархост уҳдадории агентӣ барои харидан ё то санаи муайян фурӯхтани амвол нест.' },
      { title: 'Дар муроҷиат кадом маълумотро нависед', text: 'Шакл муроҷиатҳоро оид ба хона, ҳавлидорӣ, объекти тиҷоратӣ ё қитъаи замин қабул мекунад. Суроға, масоҳат, ошёна ва шумораи ошёнаҳо, ҳолат, нархи интизорӣ ва муҳлати дилхоҳи фурӯшро нависед. Аксҳои нав омода кунед ва вақти имконпазири боздидро гӯед. Барои суҳбати аввал шарҳи объект ва мақсади шумо кофист.' },
      { title: 'Нархро чӣ гуна муҳокима кардан лозим', text: 'Пешниҳодҳои дорои масоҳат, ҷойгиршавӣ ва ҳолати монандро муқоиса кунед. Нархи эълон аз нархи мувофиқашудаи муомила фарқ мекунад. Суҳбати пешакӣ бо телефон ҷойи боздидро намегирад; шартҳои ниҳоӣ аз объект, ҳуҷҷатҳо ва созиши тарафҳо вобастаанд.' },
      { title: 'Пеш аз оғози кор чиро мувофиқа кунед', text: 'Таркиби хизматрасонӣ, ҳаққи хизмат ва хароҷот, тартиби ҷойгир кардани эълон ва боздидҳоро пурсед. Дар бораи хусусиятҳои ҳуҷҷатҳо ва иштироки намояндагон хабар диҳед. Рӯйхати ҳуҷҷатҳо ва тартиби расмиятдарориро барои ҳолати худ муайян карда, шартҳои мувофиқашудаи корро хаттӣ сабт кунед.' },
    ], buyout: 'Муҳокимаи имкони хариди фаврӣ', contacts: 'Тамос бо ROYAL HOME',
  },
  en: {
    title: 'Preparing to sell a property',
    sections: [
      { title: 'Agency sale and direct buyout', text: 'An agency sale involves discussing the offer, finding a buyer and arranging viewings. Buyout is a separate option: availability and price are considered for the particular property. Sending an enquiry does not commit the agency to buying the property or selling it by a particular date.' },
      { title: 'What to include in your enquiry', text: 'The form accepts enquiries about an apartment, house, commercial property or land. Include the address, area, floor and building height, condition, expected price and preferred timing. Prepare current photographs and say when a viewing is possible. An initial conversation needs a description of the property and your objective.' },
      { title: 'Discussing the price', text: 'Compare offers with similar areas, locations and condition. An asking price differs from the agreed transaction price. An initial telephone discussion does not replace a viewing; final terms depend on the property, documents and agreement between the parties.' },
      { title: 'What to agree before work starts', text: 'Clarify the services, remuneration and expenses, listing arrangements and viewings. Mention document issues and any representatives involved. The document list and transaction procedure need to suit your circumstances; record the agreed working terms in writing.' },
    ], buyout: 'Discuss a possible buyout', contacts: 'Contact ROYAL HOME',
  },
};
