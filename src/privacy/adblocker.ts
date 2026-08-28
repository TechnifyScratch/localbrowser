import { app, type Session } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FiltersEngine, Request } from '@ghostery/adblocker';

let blocker: FiltersEngine | null = null;

export async function initializeAdBlocker(): Promise<void> {
  const enginePath = app.isPackaged
    ? path.join(process.resourcesPath, 'adblocker-engine.bin')
    : path.join(app.getAppPath(), 'build', 'adblocker-engine.bin');
  try {
    blocker = FiltersEngine.deserialize(await fs.readFile(enginePath));
  } catch (error) {
    blocker = null;
    console.error('Could not load Local AdBlocker rules', error);
  }
}

export function configureAdBlockerSession(browserSession: Session, enabled: () => boolean): void {
  browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!enabled() || !blocker || !details.webContentsId) {
      callback({});
      return;
    }
    const request = Request.fromRawDetails({
      _originalRequestDetails: details,
      requestId: `${details.id}`,
      sourceUrl: details.referrer,
      tabId: details.webContentsId,
      type: details.resourceType || 'other',
      url: details.url,
    });
    if (request.isMainFrame()) {
      callback({});
      return;
    }
    const { redirect, match } = blocker.match(request);
    if (redirect) callback({ redirectURL: redirect.dataUrl });
    else callback(match ? { cancel: true } : {});
  });
}

export function cosmeticAdStyles(url: string, enabled: boolean): string {
  if (!enabled || !blocker) return '';
  try {
    const hostname = new URL(url).hostname;
    const labels = hostname.split('.');
    const domain = labels.length > 1 ? labels.slice(-2).join('.') : hostname;
    const result = blocker.getCosmeticsFilters({
      url,
      hostname,
      domain,
      getBaseRules: true,
      getInjectionRules: true,
      getExtendedRules: false,
      getRulesFromDOM: false,
      getRulesFromHostname: true,
    });
    return result.active === false ? '' : result.styles;
  } catch { return ''; }
}
