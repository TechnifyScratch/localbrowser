import { BrowserView, BrowserWindow, shell, type Session, type WebContents } from 'electron';
import path from 'node:path';
import type { AppSnapshot, ClosedTab, DownloadState, PermissionKind, PermissionRequest, SearchCategory, SearchResponse, TabState } from '../shared/types';
import { configurePrivacySession, resolveInput, stripTracking } from '../privacy';
import { configureAdBlockerSession, cosmeticAdPayload } from '../privacy/adblocker';
import { LocalStore } from './storage';
import { searchWeb } from './search';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

interface TabRecord { state: TabState; view: BrowserView | null; returnToSearch?: string; }

export class BrowserManager {
  private tabs = new Map<string, TabRecord>();
  private activeTabId: string | null = null;
  private overlayOpen = false;
  private pendingPermissions = new Map<string, (allowed: boolean) => void>();
  private configuredSessions = new Set<Session>();
  private recentlyClosed: ClosedTab[] = [];
  private searchCache = new Map<string, { response: SearchResponse; expiresAt: number }>();
  private searchQueue: Promise<void> = Promise.resolve();
  private lastProviderRequestAt = 0;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: LocalStore,
    private readonly privateWindow: boolean,
    private readonly browserSession: Session,
  ) {
    this.configureSession(browserSession);
    window.on('resize', () => this.layout());
    window.on('closed', () => this.dispose());
  }

  get snapshot(): AppSnapshot {
    return {
      tabs: [...this.tabs.values()].map(({ state }) => ({ ...state })),
      activeTabId: this.activeTabId,
      settings: this.store.settings,
      privateWindow: this.privateWindow,
      recentlyClosed: [...this.recentlyClosed],
    };
  }

  async createTab(options: { url?: string; activate?: boolean; pinned?: boolean } = {}): Promise<void> {
    const id = crypto.randomUUID();
    const state: TabState = {
      id, title: 'New Tab', url: 'local://newtab', loading: false,
      canGoBack: false, canGoForward: false, private: this.privateWindow, pinned: options.pinned === true,
    };
    this.tabs.set(id, { state, view: null });
    if (options.activate !== false) this.activate(id);
    if (options.url && options.url !== 'local://newtab') {
      if (this.activeTabId !== id) this.activate(id);
      await this.navigate(options.url);
    }
    this.emit();
  }

  activate(id: string): void {
    const next = this.tabs.get(id);
    if (!next) return;
    this.detachActiveView();
    this.activeTabId = id;
    if (next.view && !this.overlayOpen) {
      this.window.setBrowserView(next.view);
      this.layout();
      next.view.webContents.focus();
    }
    this.emit();
  }

  reorder(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    const source = this.tabs.get(sourceId);
    const target = this.tabs.get(targetId);
    if (!source || !target || source.state.pinned !== target.state.pinned) return;
    const entries = [...this.tabs.entries()];
    const sourceIndex = entries.findIndex(([id]) => id === sourceId);
    const targetIndex = entries.findIndex(([id]) => id === targetId);
    const [moved] = entries.splice(sourceIndex, 1);
    entries.splice(targetIndex, 0, moved);
    this.tabs = new Map(entries);
    this.emit();
    if (!this.privateWindow) void this.persistSession();
  }

  pin(id: string, pinned: boolean): void {
    const record = this.tabs.get(id);
    if (!record) return;
    record.state = { ...record.state, pinned };
    const entries = [...this.tabs.entries()].sort((a, b) => Number(b[1].state.pinned) - Number(a[1].state.pinned));
    this.tabs = new Map(entries);
    this.emit();
    if (!this.privateWindow) void this.persistSession();
  }

  async duplicate(id: string): Promise<void> {
    const tab = this.tabs.get(id)?.state;
    if (!tab) return;
    await this.createTab({ url: tab.url });
  }

  async closeOthers(id: string): Promise<void> {
    if (!this.tabs.has(id)) return;
    for (const otherId of [...this.tabs.keys()]) if (otherId !== id) await this.close(otherId);
    this.activate(id);
  }

  async reopenClosed(): Promise<void> {
    const closed = this.recentlyClosed.shift();
    if (closed) await this.createTab({ url: closed.url });
  }

  async close(id: string): Promise<void> {
    const record = this.tabs.get(id);
    if (!record) return;
    const ids = [...this.tabs.keys()];
    const index = ids.indexOf(id);
    if (ALLOWED_PROTOCOLS.has(safeProtocol(record.state.url))) {
      this.recentlyClosed.unshift({ title: record.state.title, url: record.state.url });
      this.recentlyClosed = this.recentlyClosed.slice(0, 12);
    }
    if (record.view) {
      if (this.activeTabId === id) this.window.removeBrowserView(record.view);
      record.view.webContents.close();
    }
    this.tabs.delete(id);
    if (this.activeTabId === id) this.activeTabId = null;
    if (!this.tabs.size) {
      await this.createTab();
    } else if (!this.activeTabId) {
      this.activate(ids[index - 1] ?? ids[index + 1]);
    }
    this.emit();
    if (!this.privateWindow) void this.persistSession();
  }

  async navigate(input: string): Promise<void> {
    const record = this.active;
    if (!record) return;
    const url = resolveInput(input, this.store.settings.searchProvider, this.store.settings.stripTrackingParameters, this.store.settings.localSearchResults);
    if (url === 'local://newtab') {
      this.setNewTab(record);
      return;
    }
    if (isLocalSearch(url)) {
      this.setLocalSearch(record, url);
      return;
    }
    if (url === 'local://extensions') {
      this.setExtensions(record);
      return;
    }
    if (isLocalSearch(record.state.url)) record.returnToSearch = record.state.url;
    const view = record.view ?? this.createView(record);
    if (!this.overlayOpen) {
      this.window.setBrowserView(view);
      this.layout();
    }
    await view.webContents.loadURL(url);
  }

  async search(query: string, category: SearchCategory): Promise<SearchResponse> {
    const key = `${category}:${query.trim().toLocaleLowerCase()}`;
    const cached = this.searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.response;
    const request = this.searchQueue.then(async () => {
      const wait = Math.max(0, 1_200 - (Date.now() - this.lastProviderRequestAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastProviderRequestAt = Date.now();
      return searchWeb(this.browserSession, query, category);
    });
    this.searchQueue = request.then(() => undefined, () => undefined);
    const response = await request;
    this.searchCache.set(key, { response, expiresAt: Date.now() + 5 * 60_000 });
    if (this.searchCache.size > 30) this.searchCache.delete(this.searchCache.keys().next().value!);
    return response;
  }

  clearSearchCache(): void { this.searchCache.clear(); }

  goBack(): void {
    const record = this.active;
    if (!record) return;
    if (record.view?.webContents.navigationHistory.canGoBack()) {
      record.view.webContents.navigationHistory.goBack();
      return;
    }
    if (record.returnToSearch) this.setLocalSearch(record, record.returnToSearch);
  }
  goForward(): void { if (this.active?.view?.webContents.navigationHistory.canGoForward()) this.active.view.webContents.navigationHistory.goForward(); }
  reload(): void { this.active?.view?.webContents.reload(); }
  stop(): void { this.active?.view?.webContents.stop(); }

  async addBookmark(): Promise<void> {
    const tab = this.active?.state;
    if (tab && ALLOWED_PROTOCOLS.has(safeProtocol(tab.url))) {
      await this.store.addBookmark({ title: tab.title, url: tab.url });
      this.emit();
    }
  }

  settingsDidChange(): void { this.layout(); this.emit(); }

  setOverlay(open: boolean): void {
    this.overlayOpen = open;
    this.detachActiveView();
    if (!open && this.active?.view) {
      this.window.setBrowserView(this.active.view);
      this.layout();
    }
  }

  respondPermission(id: string, allow: boolean): void {
    this.pendingPermissions.get(id)?.(allow);
    this.pendingPermissions.delete(id);
  }

  private get active(): TabRecord | undefined { return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined; }

  private createView(record: TabRecord): BrowserView {
    const view = new BrowserView({ webPreferences: {
      session: this.browserSession,
      preload: path.join(__dirname, '../preload/web-content.js'),
      additionalArguments: [`--local-adblock=${this.store.settings.adBlockerEnabled ? '1' : '0'}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !this.privateWindow,
    }});
    record.view = view;
    const contents = view.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      if (ALLOWED_PROTOCOLS.has(safeProtocol(url))) void this.createTab({ url });
      else if (safeProtocol(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!ALLOWED_PROTOCOLS.has(safeProtocol(url))) event.preventDefault();
      else if (this.store.settings.stripTrackingParameters) {
        const cleaned = stripTracking(url);
        if (cleaned !== url) { event.preventDefault(); void contents.loadURL(cleaned); }
      }
    });
    contents.on('did-start-loading', () => this.update(record, { loading: true }));
    contents.on('dom-ready', () => {
      const { styles, scripts } = cosmeticAdPayload(contents.getURL(), this.store.settings.adBlockerEnabled);
      if (styles) void contents.insertCSS(styles, { cssOrigin: 'user' }).catch(() => undefined);
      for (const script of scripts) void contents.executeJavaScript(script, true).catch(() => undefined);
    });
    contents.on('did-stop-loading', () => this.updateFromContents(record, contents));
    contents.on('did-navigate', (_event, url) => this.onNavigated(record, contents, url));
    contents.on('did-navigate-in-page', (_event, url) => this.onNavigated(record, contents, url));
    contents.on('page-title-updated', (_event, title) => {
      const resolvedTitle = title || hostname(record.state.url);
      this.update(record, { title: resolvedTitle });
      if (!this.privateWindow && ALLOWED_PROTOCOLS.has(safeProtocol(record.state.url))) void this.store.updateHistoryTitle(record.state.url, resolvedTitle);
    });
    contents.on('page-favicon-updated', (_event, favicons) => this.update(record, { favicon: favicons[0] }));
    contents.on('render-process-gone', () => this.update(record, { loading: false, title: 'Page unavailable' }));
    return view;
  }

  private onNavigated(record: TabRecord, contents: WebContents, url: string): void {
    this.updateFromContents(record, contents, url);
    if (!this.privateWindow && ALLOWED_PROTOCOLS.has(safeProtocol(url))) {
      void this.store.addHistory({ title: contents.getTitle() || hostname(url), url, visitedAt: Date.now() });
      void this.persistSession();
    }
  }

  private updateFromContents(record: TabRecord, contents: WebContents, url = contents.getURL()): void {
    this.update(record, {
      url, loading: contents.isLoading(), title: contents.getTitle() || hostname(url),
      canGoBack: contents.navigationHistory.canGoBack() || Boolean(record.returnToSearch), canGoForward: contents.navigationHistory.canGoForward(),
    });
  }

  private update(record: TabRecord, patch: Partial<TabState>): void {
    record.state = { ...record.state, ...patch };
    this.emit();
  }

  private setNewTab(record: TabRecord): void {
    if (record.view) {
      this.window.removeBrowserView(record.view);
      record.view.webContents.close();
      record.view = null;
    }
    record.returnToSearch = undefined;
    record.state = { ...record.state, title: 'New Tab', url: 'local://newtab', loading: false, canGoBack: false, canGoForward: false };
    this.emit();
  }

  private setLocalSearch(record: TabRecord, url: string): void {
    if (record.view) {
      this.window.removeBrowserView(record.view);
      record.view.webContents.close();
      record.view = null;
    }
    record.returnToSearch = undefined;
    const query = searchQuery(url);
    record.state = {
      ...record.state,
      title: query ? `${query} — Local Search` : 'Local Search',
      url,
      favicon: undefined,
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    this.emit();
    if (!this.privateWindow) void this.persistSession();
  }

  private setExtensions(record: TabRecord): void {
    if (record.view) {
      this.window.removeBrowserView(record.view);
      record.view.webContents.close();
      record.view = null;
    }
    record.returnToSearch = undefined;
    record.state = {
      ...record.state,
      title: 'Extensions',
      url: 'local://extensions',
      favicon: undefined,
      loading: false,
      canGoBack: false,
      canGoForward: false,
    };
    this.emit();
  }

  private configureSession(browserSession: Session): void {
    if (this.configuredSessions.has(browserSession)) return;
    this.configuredSessions.add(browserSession);
    configurePrivacySession(browserSession, () => this.store.settings.blockThirdPartyCookies);
    configureAdBlockerSession(browserSession, () => this.store.settings.adBlockerEnabled);
    browserSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
      const allowed: PermissionKind[] = ['camera', 'microphone', 'notifications', 'geolocation'];
      if (!allowed.includes(permission as PermissionKind)) return callback(false);
      const id = crypto.randomUUID();
      this.pendingPermissions.set(id, callback);
      const request: PermissionRequest = { id, permission: permission as PermissionKind, origin: details.requestingUrl ? hostname(details.requestingUrl) : 'This site' };
      this.window.webContents.send('permission:request', request);
      setTimeout(() => this.respondPermission(id, false), 30_000);
    });
    browserSession.on('will-download', (_event, item) => {
      const id = crypto.randomUUID();
      const send = (status: DownloadState['status']) => {
        const total = item.getTotalBytes();
        this.window.webContents.send('download:update', {
          id, filename: item.getFilename(), progress: total ? item.getReceivedBytes() / total : 0, status,
        } satisfies DownloadState);
      };
      send('progressing');
      item.on('updated', (_e, state) => send(state === 'progressing' ? 'progressing' : 'interrupted'));
      item.once('done', (_e, state) => send(state));
    });
  }

  private layout(): void {
    const view = this.active?.view;
    if (!view || this.overlayOpen) return;
    const [width, height] = this.window.getContentSize();
    const chromeHeight = this.store.settings.showBookmarksBar ? 146 : 116;
    view.setBounds({ x: 0, y: chromeHeight, width, height: Math.max(0, height - chromeHeight) });
    view.setAutoResize({ width: true, height: true });
  }

  private detachActiveView(): void { if (this.active?.view) this.window.removeBrowserView(this.active.view); }
  private emit(): void { if (!this.window.isDestroyed()) this.window.webContents.send('state:snapshot', this.snapshot); }
  private async persistSession(): Promise<void> {
    await this.store.setSessionTabs([...this.tabs.values()].map(({ state }) => ({ url: state.url, pinned: state.pinned })).filter(({ url }) => ALLOWED_PROTOCOLS.has(safeProtocol(url))));
  }
  private dispose(): void {
    for (const { view } of this.tabs.values()) view?.webContents.close();
    this.searchCache.clear();
    if (this.privateWindow) void this.browserSession.clearStorageData();
  }
}

function safeProtocol(url: string): string { try { return new URL(url).protocol; } catch { return ''; } }
function hostname(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function isLocalSearch(url: string): boolean { return url.startsWith('local://search?'); }
function searchQuery(url: string): string { try { return new URL(url).searchParams.get('q') ?? ''; } catch { return ''; } }
