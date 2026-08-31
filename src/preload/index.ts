import { contextBridge, ipcRenderer } from 'electron';
import type { AppSnapshot, DownloadState, LocalAPI, PermissionRequest, UpdateState } from '../shared/types';

const subscribe = <T>(channel: string, listener: (value: T) => void): (() => void) => {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

const api: LocalAPI = {
  getSnapshot: () => ipcRenderer.invoke('state:get'),
  newTab: (options) => ipcRenderer.invoke('tabs:new', options),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),
  reorderTab: (sourceId, targetId) => ipcRenderer.invoke('tabs:reorder', sourceId, targetId),
  splitTabs: (sourceId, targetId) => ipcRenderer.invoke('tabs:split', sourceId, targetId),
  closeSplitView: () => ipcRenderer.invoke('tabs:close-split'),
  pinTab: (id, pinned) => ipcRenderer.invoke('tabs:pin', id, pinned),
  duplicateTab: (id) => ipcRenderer.invoke('tabs:duplicate', id),
  closeOtherTabs: (id) => ipcRenderer.invoke('tabs:close-others', id),
  reopenClosedTab: () => ipcRenderer.invoke('tabs:reopen-closed'),
  showTabContextMenu: (id) => ipcRenderer.invoke('tabs:context-menu', id),
  showTabOverview: () => ipcRenderer.invoke('tabs:overview'),
  openExtensions: () => ipcRenderer.invoke('extensions:open'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  showExtensionsPopup: (anchor, view) => ipcRenderer.invoke('extensions:popup', anchor, view),
  closeExtensionsPopup: () => ipcRenderer.invoke('extensions:close-popup'),
  resizeExtensionsPopup: (view) => ipcRenderer.invoke('extensions:resize-popup', view),
  readyForLaunch: () => ipcRenderer.invoke('launch:ready'),
  navigate: (input) => ipcRenderer.invoke('browser:navigate', input),
  search: (query, category) => ipcRenderer.invoke('search:query', query, category),
  goBack: () => ipcRenderer.invoke('browser:back'),
  goForward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  openPrivateWindow: () => ipcRenderer.invoke('window:private'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setOverlay: (open) => ipcRenderer.invoke('settings:overlay', open),
  clearData: (scope) => ipcRenderer.invoke('data:clear', scope),
  addBookmark: () => ipcRenderer.invoke('bookmarks:add'),
  addBookmarkUrl: (bookmark) => ipcRenderer.invoke('bookmarks:add-url', bookmark),
  getBookmarks: () => ipcRenderer.invoke('bookmarks:get'),
  getTodayItems: () => ipcRenderer.invoke('today:get'),
  getCollections: () => ipcRenderer.invoke('collections:get'),
  createCollection: (input) => ipcRenderer.invoke('collections:create', input),
  renameCollection: (id, name) => ipcRenderer.invoke('collections:rename', id, name),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  addCollectionItem: (collectionId, item) => ipcRenderer.invoke('collections:add-item', collectionId, item),
  removeCollectionItem: (collectionId, itemId) => ipcRenderer.invoke('collections:remove-item', collectionId, itemId),
  respondPermission: (id, allow) => ipcRenderer.invoke('permission:respond', id, allow),
  showItemInFolder: (path) => ipcRenderer.invoke('download:show', path),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onSnapshot: (listener) => subscribe<AppSnapshot>('state:snapshot', listener),
  onFocusAddress: (listener) => subscribe<void>('command:focus-address', listener),
  onOpenSettings: (listener) => subscribe<void>('command:open-settings', listener),
  onPermissionRequest: (listener) => subscribe<PermissionRequest>('permission:request', listener),
  onDownload: (listener) => subscribe<DownloadState>('download:update', listener),
  onUpdateState: (listener) => subscribe<UpdateState>('update:state', listener),
  onLaunchStart: (listener) => subscribe<void>('launch:start', listener),
};

contextBridge.exposeInMainWorld('local', api);
