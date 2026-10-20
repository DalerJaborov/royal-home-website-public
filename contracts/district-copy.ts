import type { PublicLocale } from './public-i18n';
import type { DistrictPage } from './district-catalog';

const COMMON = {
  ru: {
    title: (name: string) => `Квартиры в районе ${name}, Душанбе`,
    description: (name: string) => `Купить квартиру в районе ${name} в Душанбе: предложения ROYAL HOME с ценами в сомони, фото, площадью, этажом и состоянием. Сравните объекты и договоритесь о просмотре.`,
    catalog: 'Все предложения', contacts: 'Организовать просмотр', listings: 'Квартиры из каталога ROYAL HOME',
    stats: 'Цены предложений в этой подборке', count: 'Квартир в подборке', range: 'Диапазон цен', median: 'Медианная цена', perMeter: 'Медиана за м²', rooms: 'Комнатность', updated: 'Последнее изменение в подборке', currency: 'сомони',
    method: 'Расчёт включает только опубликованные непроданные квартиры ROYAL HOME в выбранном районе. Дома, участки и проданные объекты исключены. Медиана делит цены этой выборки пополам. Это цены предложений агентства, а не цены сделок и не оценка всего рынка Душанбе. Количество и состав предложений меняются; наличие и окончательные условия уточняйте перед просмотром.',
    checklist: 'Что уточнить до просмотра', steps: ['Сопоставьте цену с площадью, этажом и состоянием конкретной квартиры. Отсутствующее поле означает, что его нужно уточнить у агентства.', 'Попросите точный адрес и проверьте свой маршрут до работы, школы или другого важного места в обычное для вас время.', 'На просмотре проверьте воду, отопление, лифт, шум, состояние подъезда и перечень того, что остаётся в квартире.', 'До передачи денег согласуйте проверку документов, основание права продавца и условия расчётов с нотариусом или профильным специалистом.'],
    empty: 'Сейчас в этой подборке нет опубликованных квартир. Посмотрите общий каталог или обсудите критерии с агентством.',
    compare: 'Сравнить другой район',
  },
  tg: {
    title: (name: string) => `Хонаҳо дар ноҳияи ${name}, Душанбе`,
    description: (name: string) => `Хариди хона дар ноҳияи ${name}, шаҳри Душанбе: пешниҳодҳои ROYAL HOME бо нарх ба сомонӣ, акс, масоҳат, ошёна ва ҳолат. Хонаҳоро муқоиса кунед ва барои боздид тамос гиред.`,
    catalog: 'Ҳамаи пешниҳодҳо', contacts: 'Ташкили боздид', listings: 'Хонаҳо аз феҳристи ROYAL HOME',
    stats: 'Нархҳои пешниҳодҳо дар ин рӯйхат', count: 'Шумораи хонаҳо', range: 'Ҳудуди нархҳо', median: 'Нархи медианӣ', perMeter: 'Медиана барои м²', rooms: 'Шумораи ҳуҷраҳо', updated: 'Тағйироти охирин дар рӯйхат', currency: 'сомонӣ',
    method: 'Ҳисоб танҳо хонаҳои нашршуда ва фурӯхтанашудаи ROYAL HOME-ро дар ноҳияи интихобшуда дар бар мегирад. Ҳавлиҳо, қитъаҳои замин ва объектҳои фурӯхташуда дохил намешаванд. Медиана нархҳои ин рӯйхатро ба ду қисми баробар ҷудо мекунад. Ин нархҳои пешниҳодии агентӣ мебошанд, на нархҳои муомилаҳо ва на арзёбии тамоми бозори Душанбе. Шумора ва таркиби пешниҳодҳо тағйир меёбанд; мавҷудият ва шартҳои ниҳоиро пеш аз боздид дақиқ кунед.',
    checklist: 'Пеш аз боздид чиро бояд пурсид', steps: ['Нархро бо масоҳат, ошёна ва ҳолати хонаи мушаххас муқоиса кунед. Агар маълумоте набошад, онро аз агентӣ пурсед.', 'Суроғаи дақиқро пурсед ва роҳро то ҷойи кор, мактаб ё ҷойи дигари муҳим дар вақти маъмулии худ санҷед.', 'Ҳангоми боздид об, гармидиҳӣ, лифт, садо, ҳолати даромадгоҳ ва ашёи дар хона мемондаро санҷед.', 'Пеш аз додани маблағ санҷиши ҳуҷҷатҳо, асоси ҳуқуқи фурӯшанда ва тартиби ҳисоббаробаркуниро бо нотариус ё мутахассиси дахлдор мувофиқа кунед.'],
    empty: 'Ҳоло дар ин рӯйхат хонаи нашршуда нест. Феҳристи умумиро бинед ё меъёрҳои худро бо агентӣ муҳокима кунед.', compare: 'Муқоисаи ноҳияи дигар',
  },
  en: {
    title: (name: string) => `Apartments in ${name}, Dushanbe`,
    description: (name: string) => `Apartments for sale in ${name}, Dushanbe: ROYAL HOME offers with prices in somoni, photos, area, floor and condition. Compare properties and arrange a viewing.`,
    catalog: 'All properties', contacts: 'Arrange a viewing', listings: 'Apartments from the ROYAL HOME catalog',
    stats: 'Asking prices in this selection', count: 'Apartments in this selection', range: 'Price range', median: 'Median asking price', perMeter: 'Median per m²', rooms: 'Room counts', updated: 'Latest listing change', currency: 'somoni',
    method: 'This calculation includes only published, unsold ROYAL HOME apartments in the selected district. Houses, land and sold properties are excluded. The median divides the prices in this sample into two equal halves. These are agency asking prices, not completed transaction prices or an estimate of the whole Dushanbe market. Availability and the selection change; confirm availability and final terms before a viewing.',
    checklist: 'What to check before a viewing', steps: ['Compare the price with the area, floor and condition of the particular apartment. A missing field means you should ask the agency to clarify it.', 'Ask for the exact address and test your route to work, school or another important destination at your usual travel time.', 'During the viewing, check water, heating, the lift, noise, the entrance and which furnishings are included.', 'Before paying, agree on document checks, the seller’s title and payment terms with a notary or an appropriate specialist.'],
    empty: 'There are currently no published apartments in this selection. Browse the full catalog or discuss your criteria with the agency.', compare: 'Compare another district',
  },
} as const;

export function districtCopy(district: DistrictPage, locale: PublicLocale) {
  const copy = COMMON[locale], name = district.names[locale];
  const additionalIntro = {
    'rayon-shohmansur': {
      ru: 'Квартиры в Шохмансуре собраны отдельно, чтобы сравнение начиналось с нужного района. Сначала выберите подходящие площадь и число комнат, затем сопоставьте этаж, состояние и полную стоимость. Если рассматриваете квартиру без отделки, обсудите отдельно будущий ремонт и сроки переезда. Расположение школы, магазинов и остановок проверяйте для конкретного дома перед просмотром.',
      tg: 'Хонаҳо дар Шоҳмансур алоҳида ҷамъ шудаанд, то муқоисаро аз ноҳияи ба шумо лозим оғоз кунед. Аввал масоҳат ва шумораи ҳуҷраҳои мувофиқро интихоб карда, баъд ошёна, ҳолат ва нархи умумиро муқоиса кунед. Агар хонаи бетаъмирро интихоб кунед, хароҷоти таъмир ва вақти кӯчиданро алоҳида баррасӣ намоед. Ҷойгиршавии мактаб, мағоза ва истгоҳҳоро барои бинои мушаххас пеш аз боздид санҷед.',
      en: 'This Shohmansur selection keeps the comparison within your chosen district. Start with the area and room count you need, then compare floors, condition and the full asking price. If you are considering an unfinished apartment, discuss the renovation budget and moving date separately. Check schools, shops and transport stops for the particular building before a viewing.',
    },
    'rayon-firdavsi': {
      ru: 'В подборке Фирдавси сравнивайте квартиры с учётом повседневных расходов и маршрутов. Бюджет покупки стоит обсуждать вместе с состоянием квартиры и тем, какая мебель остаётся. Для вариантов на разных этажах уточните работу лифта и доступ в подъезд. Диапазон цен ниже рассчитан только по текущим предложениям ROYAL HOME в этом районе; он не означает, что весь район дешевле или дороже другого.',
      tg: 'Дар рӯйхати Фирдавсӣ хонаҳоро бо дарназардошти хароҷот ва роҳҳои ҳаррӯза муқоиса кунед. Буҷаи харидро бо ҳолати хона ва мебели дар он мемонда якҷо баррасӣ намоед. Барои хонаҳои ошёнаҳои гуногун кори лифт ва даромад ба биноро пурсед. Ҳудуди нархҳои поён танҳо аз пешниҳодҳои ҷории ROYAL HOME дар ҳамин ноҳия ҳисоб шудааст; он арзонтар ё гаронтар будани тамоми ноҳияро нишон намедиҳад.',
      en: 'Compare this Firdavsi selection with everyday costs and travel in mind. Discuss the purchase budget alongside the apartment’s condition and which furnishings remain. For apartments on different floors, ask about the lift and entrance access. The price range below uses only current ROYAL HOME offers in this district; it does not establish that the whole district is cheaper or more expensive than another.',
    },
  };
  const intro = district.slug in additionalIntro
    ? additionalIntro[district.slug as keyof typeof additionalIntro][locale]
    : district.slug === 'rayon-sino'
    ? ({ ru: 'Выбирайте квартиру в Сино по конкретному адресу, планировке и бюджету. Здесь собраны предложения агентства по этому району: можно сравнить разные площади и этажи, открыть фотографии и проверить состояние каждого объекта. Не переносите цену одной квартиры на весь район — дом, отделка и площадь влияют на сравнение.', tg: 'Хонаро дар Сино аз рӯйи суроғаи мушаххас, тарҳ ва буҷа интихоб кунед. Дар ин ҷо пешниҳодҳои агентӣ барои ҳамин ноҳия ҷамъ шудаанд: масоҳат ва ошёнаҳоро муқоиса кунед, аксҳоро кушоед ва ҳолати ҳар объектро бинед. Нархи як хонаро ба тамоми ноҳия нисбат надиҳед — бино, пардоз ва масоҳат ба муқоиса таъсир мерасонанд.', en: 'Choose an apartment in Sino by its exact address, layout and your budget. This selection brings together the agency’s offers in the district: compare areas and floors, open the photos and check each property’s condition. One apartment’s price does not represent the whole district; the building, finishing and area matter.' }[locale])
    : ({ ru: 'В подборке по Исмоили Сомони сравнивайте не только название района, но и конкретный дом. Откройте несколько квартир с подходящим числом комнат, сопоставьте полную цену и цену за метр. Отдельно уточните доступ в дом, парковку и состояние лифта; эти условия нельзя определить только по адресу или фотографиям.', tg: 'Дар рӯйхати Исмоили Сомонӣ на танҳо номи ноҳия, балки бинои мушаххасро муқоиса кунед. Якчанд хонаи дорои шумораи мувофиқи ҳуҷраҳоро кушоед, нархи умумӣ ва нархи як метри мураббаъро муқоиса кунед. Дастрасӣ ба бино, таваққуфгоҳ ва ҳолати лифтро алоҳида пурсед; ин шароитро танҳо аз суроға ё акс муайян кардан мумкин нест.', en: 'When comparing apartments in Ismoili Somoni, look at the particular building as well as the district name. Open several apartments with a suitable room count and compare both the total price and the price per square metre. Ask separately about building access, parking and the lift; an address or photos alone cannot establish these conditions.' }[locale]);
  return { ...copy, name, heading: copy.title(name), title: `${copy.title(name)} | ROYAL HOME`, description: copy.description(name), intro };
}
