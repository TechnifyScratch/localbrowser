import type { Session } from 'electron';
import type { SearchProviderId } from '../shared/types';

const trackingParameters = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid',
]);

const searchProviders: Record<SearchProviderId, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
  google: 'https://www.google.com/search?q=',
};

export function stripTracking(urlString: string): string {
  try {
    const url = new URL(urlString);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameters.has(key.toLowerCase())) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : urlString;
  } catch {
    return urlString;
  }
}

export function resolveInput(input: string, provider: SearchProviderId, shouldStrip: boolean, localSearchResults = false): string {
  const value = input.trim();
  if (!value) return 'local://newtab';

  const explicitScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  const looksLikeHost = !value.includes(' ') && (
    value === 'localhost' || value.startsWith('localhost:') ||
    /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/#?].*)?$/i.test(value) ||
    /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/#?].*)?$/.test(value)
  );

  if (explicitScheme || looksLikeHost) {
    const url = explicitScheme ? value : `${value.startsWith('localhost') ? 'http' : 'https'}://${value}`;
    return shouldStrip ? stripTracking(url) : url;
  }
  if (localSearchResults) return `local://search?q=${encodeURIComponent(value)}`;
  return `${searchProviders[provider]}${encodeURIComponent(value)}`;
}

export function configurePrivacySession(session: Session, blockThirdPartyCookies: () => boolean): void {
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!blockThirdPartyCookies() || !details.requestHeaders.Cookie) return callback({ requestHeaders: details.requestHeaders });
    try {
      const destination = new URL(details.url).hostname;
      const originHeader = details.requestHeaders.Origin ?? details.requestHeaders.Referer;
      const initiator = originHeader ? new URL(originHeader).hostname : destination;
      const sameSite = destination === initiator || destination.endsWith(`.${initiator}`) || initiator.endsWith(`.${destination}`);
      if (!sameSite) delete details.requestHeaders.Cookie;
    } catch { /* Keep headers when Chromium does not provide a parseable initiator. */ }
    callback({ requestHeaders: details.requestHeaders });
  });
}
