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
    deleteHeader(details.requestHeaders, 'dnt');
    deleteHeader(details.requestHeaders, 'sec-gpc');
    details.requestHeaders.DNT = '1';
    details.requestHeaders['Sec-GPC'] = '1';
    const initiator = details.referrer || details.frame?.url || details.webContents?.getURL() || '';
    if (blockThirdPartyCookies() && isThirdParty(details.url, initiator, details.resourceType)) {
      deleteHeader(details.requestHeaders, 'cookie');
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    const responseHeaders = details.responseHeaders;
    const initiator = details.referrer || details.frame?.url || details.webContents?.getURL() || '';
    if (blockThirdPartyCookies() && responseHeaders && isThirdParty(details.url, initiator, details.resourceType)) {
      deleteHeader(responseHeaders, 'set-cookie');
      deleteHeader(responseHeaders, 'set-cookie2');
    }
    callback({ responseHeaders });
  });
}

function deleteHeader(headers: Record<string, unknown>, target: string): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === target) delete headers[name];
  }
}

function isThirdParty(destinationUrl: string, referrer: string, resourceType: string): boolean {
  if (resourceType === 'mainFrame' || !referrer) return false;
  try {
    const destination = new URL(destinationUrl).hostname;
    const initiator = new URL(referrer).hostname;
    return !sameSite(destination, initiator);
  } catch {
    return false;
  }
}

function sameSite(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}
