export type SearchProviderId = 'duckduckgo' | 'brave' | 'google';

export interface Settings {
  blockThirdPartyCookies: boolean;
  stripTrackingParameters: boolean;
  openPreviousSession: boolean;
  showBookmarksBar: boolean;
  searchProvider: SearchProviderId;
  localSearchResults: boolean;
  onboardingComplete: boolean;
  showCollections: boolean;
  showToday: boolean;
  automaticUpdateChecks: boolean;
  adBlockerEnabled: boolean;
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unavailable';
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  message?: string;
  delivery?: 'in-place' | 'dmg';
}

export interface TabState {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  private: boolean;
  pinned: boolean;
}

export interface ClosedTab {
  title: string;
  url: string;
}

export interface DownloadState {
  id: string;
  filename: string;
  progress: number;
  status: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
}

export interface AppSnapshot {
  tabs: TabState[];
  activeTabId: string | null;
  settings: Settings;
  privateWindow: boolean;
  recentlyClosed: ClosedTab[];
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  visitedAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface TodayItem {
  id: string;
  title: string;
  url: string;
  source: string;
  timestamp: number;
  kind: 'recent' | 'saved';
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
  snippet: string;
  thumbnailUrl?: string;
  creator?: string;
  license?: string;
  age?: string;
  duration?: string;
  price?: string;
  width?: number;
  height?: number;
}

export type SearchCategory = 'all' | 'images' | 'videos' | 'news' | 'forums' | 'shopping';

export interface SearchOverview {
  points: string[];
  sources: Array<{ title: string; url: string; source: string }>;
}

export interface PersonProfile {
  id: string;
  name: string;
  description: string;
  extract?: string;
  imageUrl?: string;
  sourceUrl: string;
  facts: Array<{ label: string; value: string }>;
}

export interface SearchResponse {
  query: string;
  category: SearchCategory;
  provider: 'DuckDuckGo' | 'Wikimedia Commons' | 'YouTube' | 'Google News' | 'Stack Exchange' | 'Local';
  results: SearchResult[];
  overview?: SearchOverview;
  person?: PersonProfile;
  attribution?: string;
}

export type CollectionColor = 'violet' | 'blue' | 'coral' | 'green';

export interface CollectionItem {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  color: CollectionColor;
  items: CollectionItem[];
  createdAt: number;
}

export type PermissionKind = 'camera' | 'microphone' | 'notifications' | 'geolocation';

export interface PermissionRequest {
  id: string;
  origin: string;
  permission: PermissionKind;
}

export interface LocalAPI {
  getSnapshot(): Promise<AppSnapshot>;
  newTab(options?: { private?: boolean }): Promise<void>;
  closeTab(id: string): Promise<void>;
  activateTab(id: string): Promise<void>;
  reorderTab(sourceId: string, targetId: string): Promise<void>;
  pinTab(id: string, pinned: boolean): Promise<void>;
  duplicateTab(id: string): Promise<void>;
  closeOtherTabs(id: string): Promise<void>;
  reopenClosedTab(): Promise<void>;
  showTabContextMenu(id: string): Promise<void>;
  showTabOverview(): Promise<void>;
  openExtensions(): Promise<void>;
  navigate(input: string): Promise<void>;
  search(query: string, category: SearchCategory): Promise<SearchResponse>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  stop(): Promise<void>;
  openPrivateWindow(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  setOverlay(open: boolean): Promise<void>;
  clearData(scope: 'history' | 'siteData' | 'all'): Promise<void>;
  addBookmark(): Promise<void>;
  addBookmarkUrl(bookmark: { title: string; url: string }): Promise<void>;
  getBookmarks(): Promise<Bookmark[]>;
  getTodayItems(): Promise<TodayItem[]>;
  getCollections(): Promise<Collection[]>;
  createCollection(input: { name: string; color: CollectionColor }): Promise<Collection[]>;
  renameCollection(id: string, name: string): Promise<Collection[]>;
  deleteCollection(id: string): Promise<Collection[]>;
  addCollectionItem(collectionId: string, item: { title: string; url: string }): Promise<Collection[]>;
  removeCollectionItem(collectionId: string, itemId: string): Promise<Collection[]>;
  respondPermission(id: string, allow: boolean): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void;
  onFocusAddress(listener: () => void): () => void;
  onOpenSettings(listener: () => void): () => void;
  onPermissionRequest(listener: (request: PermissionRequest) => void): () => void;
  onDownload(listener: (download: DownloadState) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}
