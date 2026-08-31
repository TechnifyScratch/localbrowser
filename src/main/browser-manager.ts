import { BrowserView, BrowserWindow, nativeImage, shell, type Session, type WebContents } from 'electron';
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
  private splitTabIds: [string, string] | null = null;
  private layoutAnimation = 0;
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
      splitTabIds: this.splitTabIds ? [...this.splitTabIds] as [string, string] : null,
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
    if (this.splitTabIds?.includes(id)) {
      this.activeTabId = id;
      if (!this.overlayOpen) {
        this.attachDisplayedViews();
        this.layout();
        next.view?.webContents.focus();
      }
      this.emit();
      return;
    }
    this.exitSplit(false);
    this.detachDisplayedViews();
    this.activeTabId = id;
    if (next.view && !this.overlayOpen) {
      this.attachView(next.view);
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

  splitTabs(sourceId: string, targetId: string): boolean {
    if (sourceId === targetId || targetId !== this.activeTabId) return false;
    const source = this.tabs.get(sourceId);
    const target = this.tabs.get(targetId);
    if (!source?.view || !target?.view || !isWebTab(source.state.url) || !isWebTab(target.state.url)) return false;
    this.detachDisplayedViews();
    this.splitTabIds = [targetId, sourceId];
    this.activeTabId = targetId;
    if (!this.overlayOpen) {
      this.attachDisplayedViews();
      this.animateSplit();
      target.view.webContents.focus();
    }
    this.emit();
    return true;
  }

  closeSplitView(): void {
    this.exitSplit(true);
    this.emit();
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
    if (this.splitTabIds?.includes(id)) {
      const companionId = this.splitTabIds.find((tabId) => tabId !== id) ?? null;
      this.detachDisplayedViews();
      this.splitTabIds = null;
      if (this.activeTabId === id) this.activeTabId = companionId;
    }
    if (ALLOWED_PROTOCOLS.has(safeProtocol(record.state.url))) {
      this.recentlyClosed.unshift({ title: record.state.title, url: record.state.url });
      this.recentlyClosed = this.recentlyClosed.slice(0, 12);
    }
    if (record.view) {
      this.window.removeBrowserView(record.view);
      record.view.webContents.close();
    }
    this.tabs.delete(id);
    if (this.activeTabId === id) this.activeTabId = null;
    if (!this.tabs.size) {
      await this.createTab();
    } else if (!this.activeTabId) {
      this.activate(ids[index - 1] ?? ids[index + 1]);
    } else if (!this.overlayOpen) {
      this.attachDisplayedViews();
      this.layout();
    }
    this.emit();
    if (!this.privateWindow) void this.persistSession();
  }

  async navigate(input: string): Promise<void> {
    const record = this.active;
    if (!record) return;
    const url = resolveInput(input, this.store.settings.searchProvider, this.store.settings.stripTrackingParameters, this.store.settings.localSearchResults);
    if (url === 'local://newtab') {
      this.exitSplit(false);
      this.setNewTab(record);
      return;
    }
    if (isLocalSearch(url)) {
      this.exitSplit(false);
      this.setLocalSearch(record, url);
      return;
    }
    if (url === 'local://extensions') {
      this.exitSplit(false);
      this.setExtensions(record);
      return;
    }
    if (url === 'local://settings') {
      this.exitSplit(false);
      this.setSettings(record);
      return;
    }
    if (isLocalSearch(record.state.url)) record.returnToSearch = record.state.url;
    const view = record.view ?? this.createView(record);
    if (!this.overlayOpen) {
      this.attachDisplayedViews();
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
      await this.store.addBookmark({ title: tab.title, url: tab.url, favicon: tab.favicon });
      this.emit();
    }
  }

  settingsDidChange(): void { this.layout(); this.emit(); }

  setOverlay(open: boolean): void {
    this.overlayOpen = open;
    this.detachDisplayedViews();
    if (!open) {
      this.attachDisplayedViews();
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
    contents.on('did-stop-loading', () => {
      this.updateFromContents(record, contents);
      if (!this.privateWindow) setTimeout(() => { void this.captureThumbnail(record, contents); }, 280);
    });
    contents.on('did-navigate', (_event, url) => this.onNavigated(record, contents, url));
    contents.on('did-navigate-in-page', (_event, url) => this.onNavigated(record, contents, url));
    contents.on('page-title-updated', (_event, title) => {
      const resolvedTitle = title || hostname(record.state.url);
      this.update(record, { title: resolvedTitle });
      if (!this.privateWindow && ALLOWED_PROTOCOLS.has(safeProtocol(record.state.url))) void this.store.updateHistoryTitle(record.state.url, resolvedTitle);
    });
    contents.on('page-favicon-updated', (_event, favicons) => { if (favicons[0]) void this.cacheFavicon(record, favicons[0]); });
    contents.on('focus', () => {
      if (!this.splitTabIds?.includes(record.state.id) || this.activeTabId === record.state.id) return;
      this.activeTabId = record.state.id;
      this.emit();
    });
    contents.on('render-process-gone', () => this.update(record, { loading: false, title: 'Page unavailable' }));
    return view;
  }

  private async cacheFavicon(record: TabRecord, faviconUrl: string): Promise<void> {
    try {
      if (faviconUrl.startsWith('data:image/') && faviconUrl.length <= 700_000) {
        const image = nativeImage.createFromDataURL(faviconUrl);
        const normalized = normalizeFavicon(image);
        this.update(record, { favicon: normalized ?? faviconUrl });
        return;
      }
      if (!ALLOWED_PROTOCOLS.has(safeProtocol(faviconUrl))) return;
      this.update(record, { favicon: faviconUrl });
      const response = await this.browserSession.fetch(faviconUrl);
      if (!response.ok) return;
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!mime?.startsWith('image/')) return;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 512_000) return;
      const normalized = normalizeFavicon(nativeImage.createFromBuffer(bytes));
      this.update(record, { favicon: normalized ?? faviconUrl });
    } catch {
      // A missing favicon should never affect navigation.
    }
  }

  private async captureThumbnail(record: TabRecord, contents: WebContents): Promise<void> {
    const url = contents.getURL();
    if (!isWebTab(url) || record.state.url !== url || contents.isDestroyed()) return;
    try {
      const image = await contents.capturePage();
      if (image.isEmpty() || record.state.url !== url) return;
      const thumbnail = image.resize({ width: 480, height: 270, quality: 'good' });
      const dataUrl = `data:image/jpeg;base64,${thumbnail.toJPEG(70).toString('base64')}`;
      await this.store.updateHistoryThumbnail(url, dataUrl);
    } catch {
      // Some protected or crashed pages cannot be captured.
    }
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

  private setSettings(record: TabRecord): void {
    if (record.view) {
      this.window.removeBrowserView(record.view);
      record.view.webContents.close();
      record.view = null;
    }
    record.returnToSearch = undefined;
    record.state = {
      ...record.state,
      title: 'Settings',
      url: 'local://settings',
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
    this.layoutAnimation += 1;
    if (this.overlayOpen) return;
    const records = this.displayedRecords();
    if (!records.length) return;
    const [width, height] = this.window.getContentSize();
    const chromeHeight = this.store.settings.showBookmarksBar ? 146 : 116;
    const contentHeight = Math.max(0, height - chromeHeight);
    if (records.length === 2) {
      const gap = 4;
      const leftWidth = Math.floor((width - gap) / 2);
      const rightWidth = Math.max(0, width - gap - leftWidth);
      records[0].view?.setBounds({ x: 0, y: chromeHeight, width: leftWidth, height: contentHeight });
      records[1].view?.setBounds({ x: leftWidth + gap, y: chromeHeight, width: rightWidth, height: contentHeight });
      records.forEach(({ view }) => view?.setAutoResize({ width: false, height: false }));
      return;
    }
    records[0].view?.setBounds({ x: 0, y: chromeHeight, width, height: contentHeight });
    records[0].view?.setAutoResize({ width: true, height: true });
  }

  private animateSplit(): void {
    const records = this.displayedRecords();
    if (records.length !== 2 || !records[0].view || !records[1].view) return;
    const [width, height] = this.window.getContentSize();
    const y = this.store.settings.showBookmarksBar ? 146 : 116;
    const contentHeight = Math.max(0, height - y);
    const gap = 4;
    const leftWidth = Math.floor((width - gap) / 2);
    const rightWidth = Math.max(0, width - gap - leftWidth);
    const left = records[0].view;
    const right = records[1].view;
    left.setAutoResize({ width: false, height: false });
    right.setAutoResize({ width: false, height: false });
    left.setBounds({ x: 0, y, width, height: contentHeight });
    right.setBounds({ x: width, y, width: rightWidth, height: contentHeight });
    const token = ++this.layoutAnimation;
    const startedAt = Date.now();
    const duration = 230;
    const step = () => {
      if (token !== this.layoutAnimation || this.overlayOpen || !this.splitTabIds) return;
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      left.setBounds({ x: 0, y, width: Math.round(width + (leftWidth - width) * eased), height: contentHeight });
      right.setBounds({ x: Math.round(width + (leftWidth + gap - width) * eased), y, width: rightWidth, height: contentHeight });
      if (progress < 1) setTimeout(step, 16);
    };
    step();
  }

  private exitSplit(animate: boolean): void {
    if (!this.splitTabIds) return;
    const activeView = this.active?.view;
    const from = activeView?.getBounds();
    this.detachDisplayedViews();
    this.splitTabIds = null;
    if (!activeView || this.overlayOpen) return;
    this.attachView(activeView);
    if (!animate || !from) {
      this.layout();
      return;
    }
    const [width, height] = this.window.getContentSize();
    const y = this.store.settings.showBookmarksBar ? 146 : 116;
    const target = { x: 0, y, width, height: Math.max(0, height - y) };
    activeView.setAutoResize({ width: false, height: false });
    const token = ++this.layoutAnimation;
    const startedAt = Date.now();
    const duration = 210;
    const step = () => {
      if (token !== this.layoutAnimation || this.overlayOpen || this.splitTabIds) return;
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      activeView.setBounds({
        x: Math.round(from.x + (target.x - from.x) * eased),
        y: target.y,
        width: Math.round(from.width + (target.width - from.width) * eased),
        height: target.height,
      });
      if (progress < 1) setTimeout(step, 16);
      else activeView.setAutoResize({ width: true, height: true });
    };
    step();
  }

  private displayedRecords(): TabRecord[] {
    if (this.splitTabIds) return this.splitTabIds.map((id) => this.tabs.get(id)).filter((record): record is TabRecord => Boolean(record?.view));
    return this.active ? [this.active] : [];
  }

  private attachDisplayedViews(): void { this.displayedRecords().forEach(({ view }) => { if (view) this.attachView(view); }); }
  private attachView(view: BrowserView): void { if (!this.window.getBrowserViews().includes(view)) this.window.addBrowserView(view); }
  private detachDisplayedViews(): void { for (const view of this.window.getBrowserViews()) this.window.removeBrowserView(view); }
  private emit(): void { if (!this.window.isDestroyed()) this.window.webContents.send('state:snapshot', this.snapshot); }
  private async persistSession(): Promise<void> {
    await this.store.setSessionTabs([...this.tabs.values()].map(({ state }) => ({ url: state.url, pinned: state.pinned })).filter(({ url }) => ALLOWED_PROTOCOLS.has(safeProtocol(url))));
  }
  private dispose(): void {
    this.layoutAnimation += 1;
    for (const { view } of this.tabs.values()) view?.webContents.close();
    this.searchCache.clear();
    if (this.privateWindow) void this.browserSession.clearStorageData();
  }
}

function safeProtocol(url: string): string { try { return new URL(url).protocol; } catch { return ''; } }
function hostname(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function isLocalSearch(url: string): boolean { return url.startsWith('local://search?'); }
function isWebTab(url: string): boolean { return ALLOWED_PROTOCOLS.has(safeProtocol(url)); }
function normalizeFavicon(image: Electron.NativeImage): string | undefined {
  if (image.isEmpty()) return undefined;
  const png = image.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
  return png.length && png.length <= 100_000 ? `data:image/png;base64,${png.toString('base64')}` : undefined;
}
function searchQuery(url: string): string { try { return new URL(url).searchParams.get('q') ?? ''; } catch { return ''; } }
