import { localizedPath, resolvePublicPath, publishedAlternates, isPublicPageComplete, type PublicLocale, type PublicLocaleDictionary } from '@contracts/public-i18n';
import { TAJIK_CATALOG, TAJIK_CONTACTS, tajikPropertyMeta, tajikPropertyDescription, tajikPropertyTitle, tajikOfficeAddress } from '@contracts/tajik-catalog';
import { englishPropertyMeta } from '@contracts/english-catalog';
import { listingJsonLd } from '@contracts/listing-jsonld';
import { SERVICE_SEO } from '@contracts/services-seo';
import { findAllListings, findListingById } from '../queries/listings';
import { findPublishedArticleBySlug, findPublishedArticles } from '../queries/articles';
import { getCmsEntry } from '../queries/cms';
import { completedLocalePages, getPublicArticleTranslation, getPublicDictionary, translationSourceHash } from './public-translations';
import { sanitizeArticleHtml } from './sanitize-html';
import type { Head } from './prerenderSeo';
import { legacyArticleTranslated, type LegacyArticleSource } from '@contracts/legacy-article-i18n';
import { ARTICLE_FINANCE_NOTE, isFinancialArticle } from '@contracts/article-finance-note';
import { localizeArticleLinks } from '@contracts/article-links';
import { articleCoverCredit } from '@contracts/article-cover-credits';
import { historicalArticleMediaDisclosure, HISTORICAL_COVER_NOTE, HISTORICAL_BODY_IMAGES_NOTE } from '@contracts/article-media-disclosure';
import { unavailableArticleListingIds } from './article-link-availability';
import { listingFactsHtml } from './listing-facts';
import { districtFromPath } from '@contracts/district-catalog';
import { districtPageData, districtNavigationHtml } from './district-catalog';
import { projectPublicListing } from '@contracts/public-listing';
import { sellGuideHtml } from './sell-guide';
import { listingSeoTitle } from '@contracts/listing-seo-title';
import { contactActionsHtml } from './contact-actions';

const ORIGIN = 'https://royalhome.tj';
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function shell(locale: PublicLocale, title: string, body: string, dictionary: PublicLocaleDictionary) {
  const tx = (source: string) => dictionary.strings[source] ?? (locale === 'tg' ? ({ Каталог: 'Феҳрист', Контакты: 'Тамос' }[source] ?? '') : ({ Каталог: 'Catalog', Контакты: 'Contact' }[source] ?? ''));
  return `<main class="mx-auto max-w-5xl px-6 py-12"><nav><a href="${localizedPath('/', locale)}">ROYAL HOME</a> · <a href="${localizedPath('/listings', locale)}">${esc(tx('Каталог'))}</a> · <a href="${localizedPath('/contacts', locale)}">${esc(tx('Контакты'))}</a></nav><h1 class="text-3xl font-bold my-6">${esc(title)}</h1><div class="space-y-4">${body}</div></main>`;
}

/** Translation publication is explicit. No Russian body is indexed as another language. */
export async function localizeHead(requestPath: string, original: Head): Promise<Head> {
  const identity = resolvePublicPath(requestPath);
  const { locale, basePath, canonicalPath } = identity;
  const completed = await completedLocalePages();
  const noindex = original.noindex || (original.status ?? 200) !== 200;
  let alternates = publishedAlternates(basePath, completed, noindex);
  const legacyMatch = /^\/blog\/(\d+)$/.exec(basePath);
  let sourceLegacy: LegacyArticleSource | undefined;
  if (legacyMatch && (original.status ?? 200) === 200) {
    const sources = await getCmsEntry('blogPosts') as LegacyArticleSource[] | undefined;
    sourceLegacy = sources?.find(post => post.id === Number(legacyMatch[1]) && post.active !== false);
    const [tg, en] = await Promise.all([getPublicDictionary('tg'), getPublicDictionary('en')]);
    alternates = publishedAlternates(basePath, {
      tg: sourceLegacy && tg && legacyArticleTranslated(sourceLegacy, tg.strings) ? completed.tg : [],
      en: sourceLegacy && en && legacyArticleTranslated(sourceLegacy, en.strings) ? completed.en : [],
    }, noindex);
  }
  const articleMatch = /^\/blog\/([a-z0-9][a-z0-9-]*)$/.exec(basePath);
  let sourceArticle;
  if (articleMatch && !/^\d+$/.test(articleMatch[1]) && (original.status ?? 200) === 200) {
    sourceArticle = await findPublishedArticleBySlug(articleMatch[1]);
    if (sourceArticle) {
      const [tg, en] = await Promise.all([getPublicArticleTranslation('tg', sourceArticle), getPublicArticleTranslation('en', sourceArticle)]);
      alternates = publishedAlternates(basePath, { tg: tg && completed.tg.includes('/blog') ? [basePath] : [], en: en && completed.en.includes('/blog') ? [basePath] : [] }, noindex);
    }
  }
  const unavailableListingIds = sourceArticle ? await unavailableArticleListingIds(sourceArticle.contentHtml) : [];
  if (locale === 'ru') return { ...original, language: 'ru', alternates, body: original.body && localizeArticleLinks(original.body, 'ru', undefined, {
    unavailableListingIds, unavailable: 'Объявление больше недоступно', catalog: 'Актуальные предложения в каталоге',
  }) };
  const dictionary = await getPublicDictionary(locale);
  const unavailableTitle = locale === 'tg' ? 'Тарҷума ҳоло дастрас нест' : 'Translation is currently unavailable';
  const unavailable = { ...original, url: `${ORIGIN}${canonicalPath}`, language: locale, alternates: [], noindex: true,
    title: `${unavailableTitle} | ROYAL HOME`, description: unavailableTitle, jsonLd: undefined,
    body: `<main><h1>${unavailableTitle}</h1><a href="${esc(basePath)}">Русский</a></main>` } satisfies Head;
  if ((original.status ?? 200) === 404) {
    const notFound = locale === 'tg' ? 'Саҳифа ёфт нашуд' : 'Page not found';
    const catalog = locale === 'tg' ? 'Феҳристи амвол' : 'Property catalog';
    return { ...unavailable, status: 404, title: `${notFound} | ROYAL HOME`, description: notFound,
      body: `<main><h1>${notFound}</h1><a href="${localizedPath('/listings', locale)}">${catalog}</a></main>` };
  }
  if ((original.status ?? 200) === 503 || !dictionary || !isPublicPageComplete(sourceArticle ? '/blog' : basePath, completed[locale])) return { ...unavailable, status: 503 };
  if (legacyMatch && (!sourceLegacy || !legacyArticleTranslated(sourceLegacy, dictionary.strings))) return { ...unavailable, status: 503 };
  const page = dictionary.pages?.[basePath];
  const tx = (text: string) => dictionary.strings[text] ?? '';
  const financeNote = (sourceTitle: string, category?: string | null) => isFinancialArticle(sourceTitle, category ?? '') && dictionary.strings[ARTICLE_FINANCE_NOTE]
    ? `<p class="article-finance-note">${esc(dictionary.strings[ARTICLE_FINANCE_NOTE])}</p>` : '';
  const defaultPage = locale === 'tg' && basePath === '/listings' ? TAJIK_CATALOG : locale === 'tg' && basePath === '/contacts' ? TAJIK_CONTACTS : undefined;
  let title = page?.title ?? defaultPage?.title;
  let description = page?.description ?? defaultPage?.description;
  let heading = page?.h1 ?? defaultPage?.h1;
  let content = `<p>${esc(page?.intro ?? description ?? '')}</p>`;
  let jsonLd: Head['jsonLd'];
  const detail = /^\/listing\/([1-9]\d*)$/.exec(basePath);
  const district = districtFromPath(basePath);
  if (district) {
    const inventory = original.catalogInventory ?? (await findAllListings()).map(projectPublicListing);
    const districtPage = districtPageData(inventory, district, locale, tx);
    title = districtPage.copy.title; description = districtPage.copy.description; heading = districtPage.copy.heading;
    content = districtPage.body; jsonLd = districtPage.jsonLd;
  } else if (detail) {
    const listing = await findListingById(Number(detail[1]));
    if (!listing || listing.published === false) return { ...unavailable, status: 404 };
    const meta = locale === 'tg' ? tajikPropertyMeta(listing) : englishPropertyMeta(listing);
    ({ title, description, heading } = meta);
    if (locale === 'tg') title = listingSeoTitle(meta.title, listing.crmShortId);
    const text = locale === 'tg' ? tajikPropertyDescription(listing) : meta.description;
    content = `<p>${esc(text).replace(/\n/g, '<br />')}</p>${listingFactsHtml(listing, tx)}${contactActionsHtml(locale, listing)}<p><a href="${localizedPath('/listings', locale)}">${locale === 'tg' ? 'Ҳамаи пешниҳодҳо' : 'All properties'}</a></p>`;
    jsonLd = listingJsonLd({ title: heading, description, images: (listing.imageUrls ?? []).map(url => new URL(url, ORIGIN).href), url: `${ORIGIN}${canonicalPath}`, price: listing.price, rooms: listing.rooms, area: listing.area, sold: listing.sold, category: listing.category, videoUrl: listing.videoUrl, uploadDate: listing.createdAt });
  } else if (sourceArticle) {
    const translation = await getPublicArticleTranslation(locale, sourceArticle);
    if (!translation) return { ...unavailable, status: 503 };
    title = translation.metaTitle || translation.title;
    description = translation.metaDescription || translation.excerpt;
    heading = translation.title;
    const coverCredit = articleCoverCredit(sourceArticle.id, sourceArticle.coverImageUrl);
    const mediaDisclosure = historicalArticleMediaDisclosure({ id: sourceArticle.id, coverImageUrl: sourceArticle.coverImageUrl, sourceHash: translationSourceHash(sourceArticle) });
    const credit = coverCredit && tx('Фото объекта из каталога')
      ? `<p>${esc(tx('Фото объекта из каталога'))} <a href="${localizedPath(`/listing/${coverCredit.listingId}`, locale)}">${esc(tx('Смотреть объект →'))}</a></p>` : '';
    const coverNote = mediaDisclosure?.cover && tx(HISTORICAL_COVER_NOTE) ? `<p>${esc(tx(HISTORICAL_COVER_NOTE))}</p>` : '';
    const bodyNote = mediaDisclosure?.body && tx(HISTORICAL_BODY_IMAGES_NOTE) ? `<p>${esc(tx(HISTORICAL_BODY_IMAGES_NOTE))}</p>` : '';
    content = `${coverNote}${credit}<p>${esc(translation.excerpt)}</p>${financeNote(sourceArticle.title, sourceArticle.category)}${bodyNote}` + localizeArticleLinks(sanitizeArticleHtml(translation.contentHtml), locale, completed[locale], {
      unavailableListingIds, unavailable: tx('Объявление больше недоступно'), catalog: tx('Актуальные предложения в каталоге'),
    });
    jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: heading, description, inLanguage: locale,
      url: `${ORIGIN}${canonicalPath}`, mainEntityOfPage: `${ORIGIN}${canonicalPath}`, image: original.image,
      datePublished: sourceArticle.publishedAt?.toISOString(), dateModified: sourceArticle.updatedAt?.toISOString(),
      publisher: { '@type': 'Organization', name: 'ROYAL HOME', '@id': `${ORIGIN}/#organization` } };
    if (translation.faq?.length) jsonLd = [jsonLd, { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: locale,
      mainEntity: translation.faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }];
  } else if (basePath === '/listings' || basePath === '/') {
    content += districtNavigationHtml(locale);
    const inventory = original.catalogInventory ?? await findAllListings();
    content += `<ul>${inventory.map(row => `<li><a href="${localizedPath(`/listing/${row.id}`, locale)}">${esc(locale === 'tg' ? tajikPropertyTitle(row) : englishPropertyMeta(row).heading)}</a> — ${row.area} ${locale === 'tg' ? 'м²' : 'm²'} · ${esc(row.price.toLocaleString(locale === 'tg' ? 'tg-TJ' : 'en-US'))} ${locale === 'tg' ? 'сомонӣ' : 'TJS'}${row.sold ? ` · ${locale === 'tg' ? 'Фурӯхта шуд' : 'Sold'}` : ''}</li>`).join('')}</ul>`;
  } else if (basePath === '/sell') {
    content += sellGuideHtml(locale);
  } else if (basePath === '/contacts' || basePath === '/about') {
    const site = dictionary.cms?.site as { address?: string; email?: string; workHours?: string } | undefined;
    content += `<p>${esc(site?.address ?? (locale === 'tg' ? tajikOfficeAddress('Душанбе, ул. Бухоро 49, 2 этаж') : 'Bukhoro Street 49, 2nd floor, Dushanbe'))}</p>${contactActionsHtml(locale)}<p>${esc(site?.email ?? 'info@royalhome.tj')}</p>${site?.workHours ? `<p>${esc(site.workHours)}</p>` : ''}`;
  } else if (basePath === '/services') {
    content += `<ul>${SERVICE_SEO.map(service => `<li><a href="${localizedPath(`/services/${service.slug}`, locale)}">${esc(tx(service.title))}</a></li>`).join('')}</ul>`;
  } else if (basePath === '/blog') {
    const [{ items }, cmsPosts] = await Promise.all([findPublishedArticles({ limit: 500, offset: 0 }), getCmsEntry('blogPosts')]);
    const rows: string[] = [];
    for (const article of items) {
      const translated = await getPublicArticleTranslation(locale, article);
      if (translated) rows.push(`<li><a href="${localizedPath(`/blog/${article.slug}`, locale)}">${esc(translated.title)}</a></li>`);
    }
    const originals = cmsPosts as LegacyArticleSource[] | undefined;
    for (const post of originals ?? []) if (post.active !== false && legacyArticleTranslated(post, dictionary.strings) && completed[locale].includes(`/blog/${post.id}`)) rows.push(`<li><a href="${localizedPath(`/blog/${post.id}`, locale)}">${esc(dictionary.strings[post.title])}</a></li>`);
    content += `<ul>${rows.join('')}</ul>`;
  } else if (/^\/blog\/\d+$/.test(basePath)) {
    const post = sourceLegacy;
    if (!post) return { ...unavailable, status: 503 };
    heading = dictionary.strings[post.title]; title = `${heading} | ROYAL HOME`; description = post.excerpt ? dictionary.strings[post.excerpt] : heading;
    const translatedContent = post.content ? dictionary.strings[post.content] : '';
    content = `<p>${esc(description)}</p>${financeNote(post.title, post.category)}` + translatedContent.split(/\n{2,}/).map(paragraph =>
      paragraph.startsWith('### ') ? `<h3>${esc(paragraph.slice(4))}</h3>` : paragraph.startsWith('## ')
        ? `<h2>${esc(paragraph.slice(3))}</h2>` : `<p>${esc(paragraph).replace(/\n/g, '<br />')}</p>`).join('');
    jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: heading, description, inLanguage: locale,
      url: `${ORIGIN}${canonicalPath}`, mainEntityOfPage: `${ORIGIN}${canonicalPath}`, image: original.image,
      publisher: { '@type': 'Organization', name: 'ROYAL HOME', '@id': `${ORIGIN}/#organization` } };
  }
  if (!title || !description || !heading) return { ...unavailable, status: 503 };
  return { ...original, title, description, language: locale, url: `${ORIGIN}${canonicalPath}`, status: 200,
    noindex, alternates: noindex ? [] : alternates, jsonLd, body: shell(locale, heading, content, dictionary) };
}
