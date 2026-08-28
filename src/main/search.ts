import type { Session } from 'electron';
import type { PersonProfile, SearchCategory, SearchOverview, SearchResponse, SearchResult } from '../shared/types';

const RESULT_LIMIT = 10;
const MAX_RESPONSE_BYTES = 2_000_000;

export async function searchWeb(browserSession: Session, query: string, category: SearchCategory): Promise<SearchResponse> {
  if (category === 'images') return searchWikimediaCommons(browserSession, query);
  if (category === 'videos') return searchYouTube(browserSession, query).catch(() => searchWikimediaVideos(browserSession, query));
  if (category === 'news') return searchGoogleNews(browserSession, query);
  if (category === 'forums') return searchStackExchange(browserSession, query);
  if (category === 'shopping') return buildShoppingLinks(query);
  if (category === 'all') {
    const [response, person] = await Promise.all([
      searchDuckDuckGo(browserSession, query),
      searchPersonProfile(browserSession, query).catch(() => undefined),
    ]);
    return { ...response, person };
  }
  return searchDuckDuckGo(browserSession, query);
}

async function searchPersonProfile(browserSession: Session, query: string): Promise<PersonProfile | undefined> {
  const searchUrl = wikidataUrl({ action: 'wbsearchentities', search: query, language: 'en', uselang: 'en', type: 'item', limit: '1' });
  const searchData = await fetchJson(browserSession, searchUrl, 'Knowledge search');
  const matches = record(searchData).search;
  const match = Array.isArray(matches) ? matches[0] : undefined;
  const id = text(record(match).id);
  if (!/^Q\d+$/.test(id)) return undefined;

  const entityUrl = wikidataUrl({ action: 'wbgetentities', ids: id, props: 'labels|descriptions|claims|sitelinks', languages: 'en', sitefilter: 'enwiki' });
  const entityData = await fetchJson(browserSession, entityUrl, 'Knowledge search');
  const entity = record(record(record(entityData).entities)[id]);
  const claims = record(entity.claims);
  if (!claimEntityIds(claims.P31).includes('Q5')) return undefined;

  const label = text(record(record(entity.labels).en).value) || text(record(match).label);
  const description = text(record(record(entity.descriptions).en).value) || text(record(match).description);
  const wikiTitle = text(record(record(entity.sitelinks).enwiki).title);
  const occupationIds = claimEntityIds(claims.P106).slice(0, 3);
  const citizenshipIds = claimEntityIds(claims.P27).slice(0, 3);
  const labelIds = [...new Set([...occupationIds, ...citizenshipIds])];
  const [claimLabels, article] = await Promise.all([
    labelIds.length ? fetchEntityLabels(browserSession, labelIds) : Promise.resolve(new Map<string, string>()),
    wikiTitle ? fetchWikipediaSummary(browserSession, wikiTitle) : Promise.resolve(undefined),
  ]);
  const facts: PersonProfile['facts'] = [];
  const born = claimTime(claims.P569);
  const died = claimTime(claims.P570);
  if (born) facts.push({ label: 'Born', value: formatKnowledgeDate(born) });
  if (died) facts.push({ label: 'Died', value: formatKnowledgeDate(died) });
  const occupations = occupationIds.map((claimId) => claimLabels.get(claimId)).filter((value): value is string => Boolean(value));
  if (occupations.length) facts.push({ label: 'Known for', value: occupations.join(', ') });
  const citizenships = citizenshipIds.map((claimId) => claimLabels.get(claimId)).filter((value): value is string => Boolean(value));
  if (citizenships.length) facts.push({ label: 'Citizenship', value: citizenships.join(', ') });
  const sourceUrl = wikiTitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, '_'))}` : `https://www.wikidata.org/wiki/${id}`;
  return { id, name: label, description, extract: article?.extract, imageUrl: article?.imageUrl, sourceUrl, facts };
}

async function fetchEntityLabels(browserSession: Session, ids: string[]): Promise<Map<string, string>> {
  const url = wikidataUrl({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels', languages: 'en' });
  const data = await fetchJson(browserSession, url, 'Knowledge details');
  const entities = record(record(data).entities);
  return new Map(ids.map((id): [string, string] => {
    const englishLabel = record(record(record(entities[id]).labels).en);
    return [id, text(englishLabel.value)];
  }).filter((entry) => Boolean(entry[1])));
}

async function fetchWikipediaSummary(browserSession: Session, title: string): Promise<{ extract?: string; imageUrl?: string } | undefined> {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', titles: title, prop: 'extracts|pageimages', exintro: '1', explaintext: '1', piprop: 'thumbnail', pithumbsize: '900', redirects: '1', format: 'json', formatversion: '2', origin: '*' }).toString();
  const data = await fetchJson(browserSession, url, 'Knowledge summary');
  const pages = record(record(data).query).pages;
  const page = Array.isArray(pages) ? record(pages[0]) : {};
  const imageUrl = cleanProviderUrl(text(record(page.thumbnail).source)) ?? undefined;
  const extract = cleanText(text(page.extract)).slice(0, 700) || undefined;
  return extract || imageUrl ? { extract, imageUrl } : undefined;
}

function wikidataUrl(params: Record<string, string>): URL {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ ...params, format: 'json', origin: '*' }).toString();
  return url;
}

async function fetchJson(browserSession: Session, url: URL, label: string): Promise<unknown> {
  const response = await browserSession.fetch(url.toString(), { headers: { Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': 'LocalBrowser/0.10 (macOS desktop browser)' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error(`${label} response was unexpectedly large`);
  return JSON.parse(body) as unknown;
}

function claimEntityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((claim) => {
    const dataValue = record(record(record(claim).mainsnak).datavalue);
    return text(record(dataValue.value).id);
  }).filter((id) => /^Q\d+$/.test(id));
}

function claimTime(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const dataValue = record(record(record(value[0]).mainsnak).datavalue);
  const time = text(record(dataValue.value).time);
  return time || undefined;
}

function formatKnowledgeDate(value: string): string {
  const match = value.match(/^[+-](\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`));
}

async function searchWikimediaCommons(browserSession: Session, query: string): Promise<SearchResponse> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '48',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName',
    iiurlwidth: '720',
    format: 'json',
    formatversion: '2',
    origin: '*',
  }).toString();
  const response = await browserSession.fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.8',
      'User-Agent': 'LocalBrowser/0.10 (macOS desktop browser)',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Image search provider returned ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('Image search response was unexpectedly large');
  const results = parseWikimediaResults(JSON.parse(body) as unknown);
  return { query, category: 'images', provider: 'Wikimedia Commons', results };
}

async function searchWikimediaVideos(browserSession: Session, query: string): Promise<SearchResponse> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `${query} filetype:video`, gsrnamespace: '6', gsrlimit: '30',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName',
    iiurlwidth: '720', format: 'json', formatversion: '2', origin: '*',
  }).toString();
  const data = await fetchJson(browserSession, url, 'Video search');
  const pages = record(record(data).query).pages;
  const results = !Array.isArray(pages) ? [] : pages.map((value): SearchResult | null => {
    const page = record(value);
    const info = record(Array.isArray(page.imageinfo) ? page.imageinfo[0] : null);
    const metadata = record(info.extmetadata);
    const target = safeWebUrl(text(info.descriptionurl));
    const thumbnailUrl = cleanProviderUrl(text(info.thumburl));
    if (!target || !text(info.mime).startsWith('video/')) return null;
    const creator = cleanText(text(record(metadata.Artist).value));
    const license = cleanText(text(record(metadata.LicenseShortName).value));
    return {
      id: `commons-video-${String(page.pageid ?? crypto.randomUUID())}`,
      title: cleanText(text(page.title)).replace(/^File:/i, '') || 'Untitled video',
      url: target, source: 'Wikimedia Commons', snippet: [creator, license].filter(Boolean).join(' · '),
      thumbnailUrl: thumbnailUrl ?? undefined, creator: [creator, license].filter(Boolean).join(' · ') || 'Wikimedia Commons', license: license || undefined,
    };
  }).filter((result): result is SearchResult => Boolean(result));
  return { query, category: 'videos', provider: 'Wikimedia Commons', results };
}

async function searchYouTube(browserSession: Session, query: string): Promise<SearchResponse> {
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', query);
  const response = await browserSession.fetch(url.toString(), { headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Local/0.10' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Video source returned ${response.status}`);
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error('Video response was unexpectedly large');
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  const end = start < 0 ? -1 : html.indexOf(';</script>', start + marker.length);
  if (start < 0 || end < 0) throw new Error('Video source did not provide results');
  const root = JSON.parse(html.slice(start + marker.length, end)) as unknown;
  const renderers: Record<string, unknown>[] = [];
  const pending: unknown[] = [root];
  while (pending.length && renderers.length < 24) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    const item = record(current);
    if (item.videoRenderer) renderers.push(record(item.videoRenderer));
    for (const child of Object.values(item)) {
      if (Array.isArray(child)) pending.push(...child);
      else if (child && typeof child === 'object') pending.push(child);
    }
  }
  const results = renderers.map((video): SearchResult | null => {
    const id = text(video.videoId);
    if (!/^[\w-]{6,20}$/.test(id)) return null;
    const thumbnails = record(video.thumbnail).thumbnails;
    const thumbnail = Array.isArray(thumbnails) ? record(thumbnails[thumbnails.length - 1]) : {};
    const title = youtubeText(video.title);
    if (!title) return null;
    return {
      id: `youtube-${id}`, title, url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, source: 'YouTube',
      snippet: youtubeText(video.descriptionSnippet), thumbnailUrl: safeWebUrl(text(thumbnail.url)) ?? undefined,
      creator: youtubeText(video.ownerText) || 'YouTube', duration: youtubeText(video.lengthText) || undefined,
      age: youtubeText(video.publishedTimeText) || undefined,
    };
  }).filter((result): result is SearchResult => Boolean(result));
  if (!results.length) throw new Error('Video source returned no usable results');
  return { query, category: 'videos', provider: 'YouTube', results };
}

function youtubeText(value: unknown): string {
  const container = record(value);
  if (text(container.simpleText)) return cleanText(text(container.simpleText));
  const runs = container.runs;
  return Array.isArray(runs) ? cleanText(runs.map((run) => text(record(run).text)).join('')) : '';
}

async function searchGoogleNews(browserSession: Session, query: string): Promise<SearchResponse> {
  const url = new URL('https://news.google.com/rss/search');
  url.search = new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' }).toString();
  const response = await browserSession.fetch(url.toString(), { headers: { Accept: 'application/rss+xml,application/xml,text/xml', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': 'LocalBrowser/0.10 (macOS desktop browser)' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`News source returned ${response.status}`);
  const xml = await response.text();
  if (xml.length > MAX_RESPONSE_BYTES) throw new Error('News response was unexpectedly large');
  const results = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 24).map((match): SearchResult | null => {
    const item = match[1];
    const target = safeWebUrl(decodeEntities(xmlValue(item, 'link')));
    if (!target) return null;
    const source = cleanText(decodeEntities(xmlValue(item, 'source'))) || 'Google News';
    const titleWithSource = cleanText(decodeEntities(xmlValue(item, 'title')));
    const title = titleWithSource.endsWith(` - ${source}`) ? titleWithSource.slice(0, -(source.length + 3)) : titleWithSource;
    const description = cleanText(decodeEntities(xmlValue(item, 'description')));
    const published = xmlValue(item, 'pubDate');
    return { id: crypto.randomUUID(), title, url: target, source, snippet: description, age: relativeTimestamp(published) };
  }).filter((result): result is SearchResult => Boolean(result));
  return { query, category: 'news', provider: 'Google News', results };
}

async function searchStackExchange(browserSession: Session, query: string): Promise<SearchResponse> {
  const technical = /\b(code|coding|program|javascript|typescript|python|java|swift|react|electron|api|server|database|linux)\b/i.test(query);
  const site = technical ? 'stackoverflow' : 'superuser';
  const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
  url.search = new URLSearchParams({ q: query, site, pagesize: '20', order: 'desc', sort: 'relevance', filter: 'withbody' }).toString();
  const data = await fetchJson(browserSession, url, 'Discussion search');
  const items = record(data).items;
  const results = !Array.isArray(items) ? [] : items.map((value): SearchResult | null => {
    const item = record(value);
    const target = safeWebUrl(text(item.link));
    if (!target) return null;
    const owner = record(item.owner);
    return {
      id: `stack-${String(item.question_id ?? crypto.randomUUID())}`,
      title: cleanText(text(item.title)), url: target, source: hostname(target),
      snippet: cleanText(text(item.body)).slice(0, 360), creator: cleanText(text(owner.display_name)) || undefined,
      age: typeof item.creation_date === 'number' ? relativeTimestamp(new Date(item.creation_date * 1000).toISOString()) : undefined,
    };
  }).filter((result): result is SearchResult => Boolean(result));
  return { query, category: 'forums', provider: 'Stack Exchange', results };
}

function buildShoppingLinks(query: string): SearchResponse {
  const encoded = encodeURIComponent(query);
  const stores = [
    ['Amazon', `https://www.amazon.com/s?k=${encoded}`], ['eBay', `https://www.ebay.com/sch/i.html?_nkw=${encoded}`],
    ['Walmart', `https://www.walmart.com/search?q=${encoded}`], ['Etsy', `https://www.etsy.com/search?q=${encoded}`],
    ['Best Buy', `https://www.bestbuy.com/site/searchpage.jsp?st=${encoded}`], ['Target', `https://www.target.com/s?searchTerm=${encoded}`],
  ];
  const results = stores.map(([source, url]) => ({ id: crypto.randomUUID(), title: `Shop “${query}” on ${source}`, url, source, snippet: `Open ${source}'s live results for current products, prices, shipping, and availability.` }));
  return { query, category: 'shopping', provider: 'Local', results, attribution: 'Retailer searches prepared locally. Prices and availability come from each store.' };
}

export function parseWikimediaResults(data: unknown): SearchResult[] {
  const pages = record(record(data).query).pages;
  if (!Array.isArray(pages)) return [];
  return pages.map((value): SearchResult | null => {
    const page = record(value);
    const info = record(Array.isArray(page.imageinfo) ? page.imageinfo[0] : null);
    const metadata = record(info.extmetadata);
    const descriptionUrl = safeWebUrl(text(info.descriptionurl));
    const thumbnailUrl = cleanProviderUrl(text(info.thumburl));
    if (!descriptionUrl || !thumbnailUrl || !text(info.mime).startsWith('image/')) return null;
    const rawTitle = cleanText(text(page.title)).replace(/^File:/i, '');
    const creator = cleanText(text(record(metadata.Artist).value));
    const license = cleanText(text(record(metadata.LicenseShortName).value));
    return {
      id: `commons-${text(page.pageid) || crypto.randomUUID()}`,
      title: rawTitle || 'Untitled image',
      url: descriptionUrl,
      source: 'Wikimedia Commons',
      snippet: [creator, license].filter(Boolean).join(' · '),
      thumbnailUrl,
      creator: creator || undefined,
      license: license || undefined,
      width: positiveNumber(info.width),
      height: positiveNumber(info.height),
    };
  }).filter((result): result is SearchResult => Boolean(result));
}

async function searchDuckDuckGo(browserSession: Session, query: string): Promise<SearchResponse> {
  const response = await browserSession.fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Local/0.10',
    },
    body: new URLSearchParams({ q: query, kl: 'us-en' }).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Search provider returned ${response.status}`);
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error('Search response was unexpectedly large');
  const results = parseDuckDuckGoResults(html);
  if (!results.length && /anomaly\.js|challenge-form|botnet/i.test(html)) throw new Error('Search provider requested verification');
  return { query, category: 'all', provider: 'DuckDuckGo', results, overview: buildOverview(query, results) };
}

export function parseDuckDuckGoResults(html: string, limit = RESULT_LIMIT): SearchResult[] {
  const results: SearchResult[] = [];
  const pattern = /<div class="result results_links([^"]*)"[\s\S]*?<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    if (match[1].includes('result--ad')) continue;
    const url = resultUrl(match[2]);
    const title = cleanText(match[3]);
    const snippet = cleanText(match[4]);
    if (!url || !title || results.some((result) => result.url === url)) continue;
    results.push({ id: crypto.randomUUID(), title, url, source: hostname(url), snippet });
    if (results.length === limit) break;
  }
  return results;
}

function xmlValue(xml: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'))?.[1].trim() ?? '';
}

function relativeTimestamp(value: string): string | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

export function buildOverview(query: string, results: SearchResult[]): SearchOverview | undefined {
  const queryTerms = new Set(words(query).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
  const candidates = results.slice(0, 6).flatMap((result, resultIndex) => splitSentences(result.snippet).map((point) => ({
    point,
    result,
    score: [...queryTerms].reduce((total, term) => total + (words(point).includes(term) ? 3 : 0), 0) + Math.max(0, 6 - resultIndex) + (point.length >= 55 && point.length <= 220 ? 2 : 0),
  })));
  const seen = new Set<string>();
  const selected = candidates.sort((a, b) => b.score - a.score).filter(({ point }) => {
    const key = words(point).slice(0, 8).join(' ');
    if (key.length < 12 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  if (!selected.length) return undefined;
  const sourceUrls = new Set<string>();
  return {
    points: selected.map(({ point }) => point),
    sources: selected.filter(({ result }) => {
      if (sourceUrls.has(result.url)) return false;
      sourceUrls.add(result.url);
      return true;
    }).map(({ result }) => ({ title: result.title, url: result.url, source: result.source })),
  };
}

const STOP_WORDS = new Set(['and', 'are', 'for', 'from', 'how', 'the', 'this', 'that', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'your']);

function splitSentences(value: string): string[] {
  return value.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((sentence) => sentence.replace(/\s*\.{3}\s*$/, '').trim()).filter((sentence) => sentence.length >= 45);
}

function words(value: string): string[] { return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }

function resultUrl(rawHref: string): string | null {
  try {
    const decodedHref = decodeEntities(rawHref);
    const candidate = decodedHref.startsWith('//') ? `https:${decodedHref}` : decodedHref;
    const redirect = new URL(candidate);
    const destination = redirect.hostname.endsWith('duckduckgo.com') ? redirect.searchParams.get('uddg') : null;
    const url = new URL(destination ?? candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  });
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function positiveNumber(value: unknown): number | undefined { return typeof value === 'number' && value > 0 ? value : undefined; }

function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function cleanProviderUrl(value: string): string | null {
  const safe = safeWebUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  return url.toString();
}
