import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import type { Bookmark, TabState } from '../../shared/types';
import type { ExtensionPopupView, Settings } from '../../shared/types';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { TabStrip } from './TabStrip';

interface Props {
  tabs: TabState[];
  activeTab: TabState | undefined;
  splitTabIds: [string, string] | null;
  privateWindow: boolean;
  bookmarks: Bookmark[];
  settings: Settings;
  onSettings(): void;
  onFocusReady(handler: () => void): void;
}

export function Toolbar({ tabs, activeTab, splitTabIds, privateWindow, bookmarks, settings, onSettings, onFocusReady }: Props) {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setValue(formatAddress(activeTab?.url ?? '')); }, [activeTab?.url, editing]);
  useEffect(() => onFocusReady(() => { input.current?.focus(); input.current?.select(); }), [onFocusReady]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (value.trim()) void window.local.navigate(value); input.current?.blur(); };
  const showExtensions = (event: MouseEvent<HTMLButtonElement>, view: ExtensionPopupView) => {
    const { x, y, width, height } = event.currentTarget.getBoundingClientRect();
    void window.local.showExtensionsPopup({ x, y, width, height }, view);
  };

  return <header className={`chrome ${settings.showBookmarksBar ? 'with-bookmarks' : ''}`}>
    <TabStrip tabs={tabs} activeTabId={activeTab?.id ?? null} splitTabIds={splitTabIds} privateWindow={privateWindow} />
    <div className="toolbar">
      <div className="nav-controls">
        <IconButton label="Back" icon="arrow-left" disabled={!activeTab?.canGoBack} onClick={() => void window.local.goBack()} />
        <IconButton label="Forward" icon="arrow-right" disabled={!activeTab?.canGoForward} onClick={() => void window.local.goForward()} />
        <IconButton label={activeTab?.loading ? 'Stop' : 'Reload'} icon={activeTab?.loading ? 'x' : 'reload'} disabled={activeTab?.url.startsWith('local://')} onClick={() => void (activeTab?.loading ? window.local.stop() : window.local.reload())} />
      </div>
      <form className="address-wrap" onSubmit={submit}>
        <Icon name="search" size={16} />
        <input ref={input} value={value} onChange={(event) => setValue(event.target.value)} onFocus={() => { setEditing(true); setValue(activeTab?.url === 'local://newtab' ? '' : activeTab?.url ?? ''); requestAnimationFrame(() => input.current?.select()); }} onBlur={() => { setEditing(false); setValue(formatAddress(activeTab?.url ?? '')); }} placeholder="Search or enter a website" aria-label="Search or enter a website" spellCheck={false} />
      </form>
      <div className="toolbar-actions">
        {splitTabIds && <IconButton className="split-view-button selected" label="Exit split view" icon="split" onClick={() => void window.local.closeSplitView()} />}
        <IconButton label="Bookmark this page" icon="star" disabled={activeTab?.url.startsWith('local://')} onClick={() => void window.local.addBookmark()} />
        <div className="extension-tools">
          {settings.adBlockerPinned && <IconButton className={`pinned-extension ${settings.adBlockerEnabled ? 'active' : ''}`} label="AdBlocker" icon="block" onClick={(event) => showExtensions(event, 'adblocker')} />}
          <IconButton label="Extensions" icon="puzzle" onClick={(event) => showExtensions(event, 'list')} />
        </div>
        <IconButton label="Local menu" icon="menu" onClick={onSettings} />
      </div>
    </div>
    {settings.showBookmarksBar && <nav className="bookmarks-bar" aria-label="Bookmarks">
      {bookmarks.length ? bookmarks.map((bookmark) => <button key={bookmark.id} onClick={() => void window.local.navigate(bookmark.url)}><span className="bookmark-favicon"><i>{bookmarkInitial(bookmark.url)}</i>{bookmark.favicon && <img src={bookmark.favicon} alt="" onError={(event) => event.currentTarget.remove()} />}</span><span>{bookmark.title}</span></button>) : <span>Bookmark a page with the star to keep it here.</span>}
    </nav>}
    {activeTab?.loading && <div className="chrome-loading" aria-hidden="true"><i /></div>}
  </header>;
}

function bookmarkInitial(url: string): string { try { return new URL(url).hostname.replace(/^www\./, '')[0]?.toUpperCase() ?? '•'; } catch { return '•'; } }

function formatAddress(url: string): string {
  if (!url || url === 'local://newtab') return '';
  if (url === 'local://extensions' || url === 'local://settings') return url;
  if (url.startsWith('local://search?')) { try { return new URL(url).searchParams.get('q') ?? ''; } catch { return ''; } }
  try { const parsed = new URL(url); return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`; }
  catch { return url; }
}
