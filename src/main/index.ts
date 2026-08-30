import { app, BrowserWindow, ipcMain, Menu, screen, session, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { BrowserManager } from './browser-manager';
import { LocalStore } from './storage';
import { LocalUpdater } from './updater';
import { initializeAdBlocker } from '../privacy/adblocker';
import type { CollectionColor, ExtensionPopupView, SearchCategory, SearchProviderId, Settings } from '../shared/types';

app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,AutofillServerCommunication,Translate');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('no-pings');

let store: LocalStore;
const updater = new LocalUpdater();
const managers = new Map<number, BrowserManager>();
const extensionPopupOwners = new Map<number, BrowserManager>();
const extensionPopups = new Map<number, BrowserWindow>();
const launchStartedWindows = new Set<number>();

const isMac = process.platform === 'darwin';
const allowedSettingKeys = new Set<keyof Settings>([
  'blockThirdPartyCookies', 'stripTrackingParameters', 'openPreviousSession',
  'showBookmarksBar', 'searchProvider', 'onboardingComplete',
  'showCollections', 'showToday', 'localSearchResults',
  'automaticUpdateChecks',
  'adBlockerEnabled', 'adBlockerPinned',
]);

async function createWindow(privateWindow = false): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: privateWindow ? 'Local — Private' : 'Local',
    backgroundColor: '#faf9f7',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const partition = privateWindow ? `private:local-${crypto.randomUUID()}` : 'persist:local';
  const manager = new BrowserManager(window, store, privateWindow, session.fromPartition(partition, { cache: !privateWindow }));
  const windowId = window.webContents.id;
  managers.set(windowId, manager);
  window.on('closed', () => { managers.delete(windowId); launchStartedWindows.delete(windowId); });

  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, '../renderer/index.html'));

  const savedTabs = !privateWindow && store.settings.openPreviousSession ? store.sessionTabs : [];
  if (savedTabs.length) {
    for (const tab of savedTabs) await manager.createTab({ url: tab.url, pinned: tab.pinned, activate: false });
    const first = manager.snapshot.tabs[0];
    if (first) manager.activate(first.id);
  } else {
    await manager.createTab();
  }
  return window;
}

function managerFor(event: Electron.IpcMainInvokeEvent): BrowserManager {
  const manager = managers.get(event.sender.id) ?? extensionPopupOwners.get(event.sender.id);
  if (!manager) throw new Error('Browser window is unavailable');
  return manager;
}

interface PopupAnchor { x: number; y: number; width: number; height: number; }

async function showExtensionPopup(parent: BrowserWindow, owner: BrowserManager, anchor: PopupAnchor, view: ExtensionPopupView): Promise<void> {
  extensionPopups.get(parent.id)?.close();
  const width = 342;
  const height = extensionPopupHeight(view);
  const content = parent.getContentBounds();
  const workArea = screen.getDisplayMatching(parent.getBounds()).workArea;
  const desiredX = content.x + anchor.x + anchor.width - width;
  const desiredY = content.y + anchor.y + anchor.height + 6;
  const x = Math.round(Math.min(Math.max(desiredX, workArea.x + 8), workArea.x + workArea.width - width - 8));
  const y = Math.round(Math.min(Math.max(desiredY, workArea.y + 8), workArea.y + workArea.height - height - 8));
  const popup = new BrowserWindow({
    parent,
    x, y, width, height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  popup.setWindowButtonVisibility(false);
  const popupWebContentsId = popup.webContents.id;
  extensionPopups.set(parent.id, popup);
  extensionPopupOwners.set(popupWebContentsId, owner);
  popup.on('blur', () => { if (!popup.isDestroyed()) popup.close(); });
  popup.on('closed', () => {
    extensionPopupOwners.delete(popupWebContentsId);
    if (extensionPopups.get(parent.id) === popup) extensionPopups.delete(parent.id);
  });
  popup.once('ready-to-show', () => { if (!popup.isDestroyed()) popup.show(); });
  if (process.env.VITE_DEV_SERVER_URL) await popup.loadURL(`${process.env.VITE_DEV_SERVER_URL}?surface=extensions&view=${view}`);
  else await popup.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { surface: 'extensions', view } });
}

function extensionPopupHeight(view: ExtensionPopupView): number { return view === 'adblocker' ? 378 : 225; }

function isExtensionPopupView(value: unknown): value is ExtensionPopupView { return value === 'list' || value === 'adblocker'; }

function validatePopupAnchor(value: unknown): PopupAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const anchor = value as Record<string, unknown>;
  if (!['x', 'y', 'width', 'height'].every((key) => typeof anchor[key] === 'number' && Number.isFinite(anchor[key]) && Math.abs(anchor[key] as number) < 10_000)) return null;
  return { x: anchor.x as number, y: anchor.y as number, width: anchor.width as number, height: anchor.height as number };
}

function registerIpc(): void {
  ipcMain.handle('state:get', (event) => managerFor(event).snapshot);
  ipcMain.handle('tabs:new', async (event) => managerFor(event).createTab());
  ipcMain.handle('tabs:close', async (event, id: unknown) => { if (typeof id === 'string') await managerFor(event).close(id); });
  ipcMain.handle('tabs:activate', (event, id: unknown) => { if (typeof id === 'string') managerFor(event).activate(id); });
  ipcMain.handle('tabs:reorder', (event, sourceId: unknown, targetId: unknown) => { if (typeof sourceId === 'string' && typeof targetId === 'string') managerFor(event).reorder(sourceId, targetId); });
  ipcMain.handle('tabs:pin', (event, id: unknown, pinned: unknown) => { if (typeof id === 'string' && typeof pinned === 'boolean') managerFor(event).pin(id, pinned); });
  ipcMain.handle('tabs:duplicate', async (event, id: unknown) => { if (typeof id === 'string') await managerFor(event).duplicate(id); });
  ipcMain.handle('tabs:close-others', async (event, id: unknown) => { if (typeof id === 'string') await managerFor(event).closeOthers(id); });
  ipcMain.handle('tabs:reopen-closed', async (event) => managerFor(event).reopenClosed());
  ipcMain.handle('tabs:context-menu', (event, id: unknown) => {
    if (typeof id !== 'string') return;
    const manager = managerFor(event);
    const tab = manager.snapshot.tabs.find((item) => item.id === id);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!tab || !window) return;
    Menu.buildFromTemplate([
      { label: tab.pinned ? 'Unpin Tab' : 'Pin Tab', click: () => manager.pin(tab.id, !tab.pinned) },
      { label: 'Duplicate Tab', click: () => { void manager.duplicate(tab.id); } },
      { label: 'Close Other Tabs', enabled: manager.snapshot.tabs.length > 1, click: () => { void manager.closeOthers(tab.id); } },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => { void manager.close(tab.id); } },
    ]).popup({ window });
  });
  ipcMain.handle('tabs:overview', (event) => {
    const manager = managerFor(event);
    const snapshot = manager.snapshot;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    const pinned = snapshot.tabs.filter((tab) => tab.pinned);
    const regular = snapshot.tabs.filter((tab) => !tab.pinned);
    const template: MenuItemConstructorOptions[] = [];
    const appendTabs = (label: string, tabs: typeof snapshot.tabs) => {
      if (!tabs.length) return;
      if (template.length) template.push({ type: 'separator' });
      template.push({ label, enabled: false });
      for (const tab of tabs) template.push({ label: tab.title || 'Untitled', type: 'checkbox', checked: tab.id === snapshot.activeTabId, click: () => manager.activate(tab.id) });
    };
    appendTabs('Pinned', pinned);
    appendTabs('Open Tabs', regular);
    if (snapshot.recentlyClosed[0]) {
      template.push({ type: 'separator' }, { label: `Reopen “${snapshot.recentlyClosed[0].title}”`, accelerator: 'CmdOrCtrl+Shift+T', click: () => { void manager.reopenClosed(); } });
    }
    Menu.buildFromTemplate(template).popup({ window });
  });
  ipcMain.handle('extensions:open', async (event) => {
    await managerFor(event).createTab({ url: 'local://extensions' });
    if (extensionPopupOwners.has(event.sender.id)) BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle('extensions:popup', async (event, anchor: unknown, view: unknown) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || !isExtensionPopupView(view)) return;
    const position = validatePopupAnchor(anchor);
    if (!position) return;
    await showExtensionPopup(parent, managerFor(event), position, view);
  });
  ipcMain.handle('extensions:close-popup', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('extensions:resize-popup', (event, view: unknown) => {
    if (!isExtensionPopupView(view)) return;
    const popup = BrowserWindow.fromWebContents(event.sender);
    if (popup && extensionPopupOwners.has(event.sender.id)) popup.setSize(342, extensionPopupHeight(view), true);
  });
  ipcMain.handle('launch:ready', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !managers.has(event.sender.id) || launchStartedWindows.has(event.sender.id)) return;
    launchStartedWindows.add(event.sender.id);
    if (!window.isVisible()) window.show();
    setTimeout(() => { if (!window.isDestroyed()) window.webContents.send('launch:start'); }, 100);
  });
  ipcMain.handle('browser:navigate', async (event, input: unknown) => { if (typeof input === 'string' && input.length <= 8_192) await managerFor(event).navigate(input); });
  ipcMain.handle('search:query', async (event, query: unknown, category: unknown) => {
    if (typeof query !== 'string' || !query.trim() || query.length > 512) throw new Error('Invalid search query');
    const allowedCategories: SearchCategory[] = ['all', 'images', 'videos', 'news', 'forums', 'shopping'];
    if (!allowedCategories.includes(category as SearchCategory)) throw new Error('Invalid search category');
    return managerFor(event).search(query.trim(), category as SearchCategory);
  });
  ipcMain.handle('browser:back', (event) => managerFor(event).goBack());
  ipcMain.handle('browser:forward', (event) => managerFor(event).goForward());
  ipcMain.handle('browser:reload', (event) => managerFor(event).reload());
  ipcMain.handle('browser:stop', (event) => managerFor(event).stop());
  ipcMain.handle('window:private', async () => { await createWindow(true); });
  ipcMain.handle('settings:update', async (event, patch: unknown) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
    const clean: Partial<Settings> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowedSettingKeys.has(key as keyof Settings)) continue;
      if (key === 'searchProvider' && ['duckduckgo', 'brave', 'google'].includes(value as string)) clean.searchProvider = value as SearchProviderId;
      else if (key !== 'searchProvider' && typeof value === 'boolean') Object.assign(clean, { [key]: value });
    }
    const settings = await store.updateSettings(clean);
    if (typeof clean.automaticUpdateChecks === 'boolean') updater.automaticChecksDidChange(clean.automaticUpdateChecks);
    for (const manager of managers.values()) managerForWindow(manager);
    return settings;
  });
  ipcMain.handle('settings:overlay', (event, open: unknown) => managerFor(event).setOverlay(open === true));
  ipcMain.handle('data:clear', async (event, scope: unknown) => {
    if (!['history', 'siteData', 'all'].includes(scope as string)) throw new Error('Invalid clear scope');
    if (scope === 'history') await store.clearHistory();
    if (scope === 'siteData' || scope === 'all') await session.fromPartition('persist:local').clearStorageData();
    if (scope === 'all') await store.clearAll();
    const manager = managerFor(event);
    manager.setOverlay(true);
    managerForWindow(manager);
  });
  ipcMain.handle('bookmarks:add', async (event) => managerFor(event).addBookmark());
  ipcMain.handle('bookmarks:add-url', async (_event, input: unknown) => {
    const item = validateSavedItem(input);
    await store.addBookmark(item);
    for (const manager of managers.values()) managerForWindow(manager);
  });
  ipcMain.handle('bookmarks:get', () => store.bookmarks);
  ipcMain.handle('today:get', () => store.todayItems);
  ipcMain.handle('collections:get', () => store.collections);
  ipcMain.handle('collections:create', async (_event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid collection');
    const { name, color } = input as Record<string, unknown>;
    return store.createCollection(validateName(name), validateColor(color));
  });
  ipcMain.handle('collections:rename', async (_event, id: unknown, name: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid collection');
    return store.renameCollection(id, validateName(name));
  });
  ipcMain.handle('collections:delete', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid collection');
    return store.deleteCollection(id);
  });
  ipcMain.handle('collections:add-item', async (_event, collectionId: unknown, input: unknown) => {
    if (typeof collectionId !== 'string') throw new Error('Invalid collection');
    return store.addCollectionItem(collectionId, validateSavedItem(input));
  });
  ipcMain.handle('collections:remove-item', async (_event, collectionId: unknown, itemId: unknown) => {
    if (typeof collectionId !== 'string' || typeof itemId !== 'string') throw new Error('Invalid collection item');
    return store.removeCollectionItem(collectionId, itemId);
  });
  ipcMain.handle('permission:respond', (event, id: unknown, allow: unknown) => { if (typeof id === 'string') managerFor(event).respondPermission(id, allow === true); });
  ipcMain.handle('download:show', (_event, file: unknown) => { if (typeof file === 'string') shell.showItemInFolder(file); });
  ipcMain.handle('update:get-state', () => updater.snapshot);
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.handle('update:install', () => updater.install());
}

function managerForWindow(manager: BrowserManager): void {
  manager.settingsDidChange();
  const window = BrowserWindow.getAllWindows().find((candidate) => managers.get(candidate.webContents.id) === manager);
  window?.webContents.send('state:snapshot', manager.snapshot);
}

function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: 'Local', submenu: [
      { role: 'about' as const }, { type: 'separator' as const },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => command('command:open-settings') },
      { label: 'Check for Updates…', click: () => { command('command:open-settings'); void updater.check(); } },
      { type: 'separator' as const }, { role: 'services' as const }, { type: 'separator' as const },
      { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const }, { role: 'quit' as const },
    ] }] : []),
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => activeManager()?.createTab() },
      { label: 'New Private Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => { void createWindow(true); } },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => { const manager = activeManager(); const id = manager?.snapshot.activeTabId; if (id) void manager.close(id); } },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => { void activeManager()?.reopenClosed(); } },
      { type: 'separator' }, { role: isMac ? 'close' : 'quit' },
    ]},
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      { label: 'Focus Address Field', accelerator: 'CmdOrCtrl+L', click: () => command('command:focus-address') },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => activeManager()?.reload() },
      { role: 'togglefullscreen' },
    ]},
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function activeManager(): BrowserManager | undefined {
  const window = BrowserWindow.getFocusedWindow();
  return window ? managers.get(window.webContents.id) : undefined;
}
function command(channel: string): void { BrowserWindow.getFocusedWindow()?.webContents.send(channel); }

function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 48) throw new Error('Name must be 1–48 characters');
  return value.trim();
}

function validateColor(value: unknown): CollectionColor {
  if (!['violet', 'blue', 'coral', 'green'].includes(value as string)) throw new Error('Invalid collection color');
  return value as CollectionColor;
}

function validateSavedItem(value: unknown): { title: string; url: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved site');
  const input = value as Record<string, unknown>;
  const title = validateName(input.title);
  if (typeof input.url !== 'string' || input.url.length > 8_192) throw new Error('Invalid URL');
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input.url.trim()) ? input.url.trim() : `https://${input.url.trim()}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only web URLs can be saved');
  return { title, url: url.toString() };
}

app.whenReady().then(async () => {
  app.setName('Local');
  store = new LocalStore();
  await store.load();
  await initializeAdBlocker();
  registerIpc();
  installMenu();
  await createWindow();
  await updater.initialize(store.settings.automaticUpdateChecks);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
