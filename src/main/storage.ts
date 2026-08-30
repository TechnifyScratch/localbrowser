import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Bookmark, Collection, CollectionColor, HistoryEntry, Settings, TodayItem } from '../shared/types';

interface StoredData {
  settings: Settings;
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  sessionTabs: Array<{ url: string; pinned: boolean }>;
  collections: Collection[];
}

export const defaultSettings: Settings = {
  blockThirdPartyCookies: true,
  stripTrackingParameters: true,
  openPreviousSession: false,
  showBookmarksBar: false,
  searchProvider: 'duckduckgo',
  localSearchResults: true,
  onboardingComplete: false,
  showCollections: true,
  showToday: true,
  automaticUpdateChecks: false,
  adBlockerEnabled: true,
  adBlockerPinned: false,
};

const starterCollections: Collection[] = [
  { id: 'starter-design', name: 'Design', color: 'violet', items: [], createdAt: 1 },
  { id: 'starter-reading', name: 'Reading', color: 'blue', items: [], createdAt: 2 },
  { id: 'starter-travel', name: 'Travel', color: 'coral', items: [], createdAt: 3 },
];

const defaults: StoredData = { settings: defaultSettings, history: [], bookmarks: [], sessionTabs: [], collections: starterCollections };

export class LocalStore {
  private data: StoredData = structuredClone(defaults);
  private readonly file = path.join(app.getPath('userData'), 'local-data.json');
  private writeChain = Promise.resolve();

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<StoredData> & { sessionUrls?: string[] };
      this.data = {
        settings: { ...defaultSettings, ...parsed.settings },
        history: Array.isArray(parsed.history) ? parsed.history : [],
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        sessionTabs: Array.isArray(parsed.sessionTabs) ? parsed.sessionTabs : (Array.isArray(parsed.sessionUrls) ? parsed.sessionUrls.map((url) => ({ url, pinned: false })) : []),
        collections: Array.isArray(parsed.collections) ? parsed.collections : structuredClone(starterCollections),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Could not read Local data', error);
    }
  }

  get settings(): Settings { return { ...this.data.settings }; }
  get bookmarks(): Bookmark[] { return [...this.data.bookmarks]; }
  get history(): HistoryEntry[] { return [...this.data.history]; }
  get sessionTabs(): Array<{ url: string; pinned: boolean }> { return structuredClone(this.data.sessionTabs); }
  get collections(): Collection[] { return structuredClone(this.data.collections); }

  get todayItems(): TodayItem[] {
    const savedUrls = new Set(this.data.bookmarks.map(({ url }) => url));
    const combined: TodayItem[] = [
      ...this.data.bookmarks.map((item) => ({ id: `saved-${item.id}`, title: item.title, url: item.url, source: hostname(item.url), timestamp: item.createdAt, kind: 'saved' as const })),
      ...this.data.history.map((item) => ({ id: `recent-${item.id}`, title: item.title, url: item.url, source: hostname(item.url), timestamp: item.visitedAt, kind: savedUrls.has(item.url) ? 'saved' as const : 'recent' as const })),
    ];
    const seen = new Set<string>();
    return combined.sort((a, b) => b.timestamp - a.timestamp).filter((item) => {
      const key = canonicalUrl(item.url);
      if (seen.has(key) || isSearchResults(item.url)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.save();
    return this.settings;
  }

  async addHistory(entry: Omit<HistoryEntry, 'id'>): Promise<void> {
    this.data.history.unshift({ ...entry, id: crypto.randomUUID() });
    this.data.history = this.data.history.slice(0, 10_000);
    await this.save();
  }

  async updateHistoryTitle(url: string, title: string): Promise<void> {
    const entry = this.data.history.find((item) => item.url === url);
    if (entry && title && entry.title !== title) { entry.title = title; await this.save(); }
  }

  async addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Promise<void> {
    if (this.data.bookmarks.some((item) => item.url === bookmark.url)) return;
    this.data.bookmarks.push({ ...bookmark, id: crypto.randomUUID(), createdAt: Date.now() });
    await this.save();
  }

  async createCollection(name: string, color: CollectionColor): Promise<Collection[]> {
    this.data.collections.push({ id: crypto.randomUUID(), name, color, items: [], createdAt: Date.now() });
    await this.save();
    return this.collections;
  }

  async renameCollection(id: string, name: string): Promise<Collection[]> {
    const collection = this.data.collections.find((item) => item.id === id);
    if (collection) { collection.name = name; await this.save(); }
    return this.collections;
  }

  async deleteCollection(id: string): Promise<Collection[]> {
    this.data.collections = this.data.collections.filter((item) => item.id !== id);
    await this.save();
    return this.collections;
  }

  async addCollectionItem(collectionId: string, item: { title: string; url: string }): Promise<Collection[]> {
    const collection = this.data.collections.find(({ id }) => id === collectionId);
    if (collection && !collection.items.some(({ url }) => url === item.url)) {
      collection.items.push({ ...item, id: crypto.randomUUID(), createdAt: Date.now() });
      await this.save();
    }
    return this.collections;
  }

  async removeCollectionItem(collectionId: string, itemId: string): Promise<Collection[]> {
    const collection = this.data.collections.find(({ id }) => id === collectionId);
    if (collection) { collection.items = collection.items.filter(({ id }) => id !== itemId); await this.save(); }
    return this.collections;
  }

  async setSessionTabs(tabs: Array<{ url: string; pinned: boolean }>): Promise<void> {
    this.data.sessionTabs = tabs;
    await this.save();
  }

  async clearHistory(): Promise<void> {
    this.data.history = [];
    await this.save();
  }

  async clearAll(): Promise<void> {
    const onboardingComplete = this.data.settings.onboardingComplete;
    this.data = structuredClone(defaults);
    this.data.settings.onboardingComplete = onboardingComplete;
    await this.save();
  }

  private save(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      await fs.rename(temp, this.file);
    });
    return this.writeChain;
  }
}

function hostname(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function canonicalUrl(url: string): string { try { const parsed = new URL(url); parsed.hash = ''; return parsed.toString(); } catch { return url; } }
function isSearchResults(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.hostname.endsWith('duckduckgo.com') && parsed.searchParams.has('q')) ||
      (parsed.hostname === 'search.brave.com' && parsed.searchParams.has('q')) ||
      (parsed.hostname.endsWith('google.com') && parsed.pathname.startsWith('/search'));
  } catch { return false; }
}
