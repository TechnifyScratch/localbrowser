import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSnapshot, Bookmark, DownloadState, PermissionRequest, Settings as SettingsType } from '../shared/types';
import { Toolbar } from './components/Toolbar';
import { Icon } from './components/Icon';
import { NewTab } from './pages/NewTab';
import { Onboarding } from './pages/Onboarding';
import { Settings } from './pages/Settings';
import { SearchResults } from './pages/SearchResults';
import { Extensions } from './pages/Extensions';

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [download, setDownload] = useState<DownloadState | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const focusAddress = useRef<() => void>(() => undefined);
  const openSettings = useCallback(() => { setSettingsOpen(true); void window.local.setOverlay(true); }, []);
  const closeSettings = useCallback(() => { setSettingsOpen(false); void window.local.setOverlay(false); }, []);

  useEffect(() => {
    void window.local.getSnapshot().then(setSnapshot);
    const cleanups = [window.local.onSnapshot(setSnapshot), window.local.onFocusAddress(() => focusAddress.current()), window.local.onOpenSettings(openSettings), window.local.onPermissionRequest(setPermission), window.local.onDownload((state) => { setDownload(state); if (state.status === 'completed') setTimeout(() => setDownload(null), 4500); })];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [openSettings]);

  const activeTab = useMemo(() => snapshot?.tabs.find((tab) => tab.id === snapshot.activeTabId), [snapshot]);
  useEffect(() => { if (snapshot?.settings.showBookmarksBar) void window.local.getBookmarks().then(setBookmarks); }, [snapshot]);
  const changeSettings = async (patch: Partial<SettingsType>) => { const settings = await window.local.updateSettings(patch); setSnapshot((current) => current ? { ...current, settings } : current); };
  if (!snapshot) return <div className="boot">Local.</div>;
  if (!snapshot.settings.onboardingComplete && !snapshot.privateWindow) return <Onboarding onComplete={() => void changeSettings({ onboardingComplete: true })} />;

  return <div className="app-shell">
    <Toolbar tabs={snapshot.tabs} activeTab={activeTab} privateWindow={snapshot.privateWindow} bookmarks={bookmarks} showBookmarksBar={snapshot.settings.showBookmarksBar} onSettings={openSettings} onFocusReady={(handler) => { focusAddress.current = handler; }} />
    {activeTab?.url === 'local://newtab' && <NewTab privateWindow={snapshot.privateWindow} settings={snapshot.settings} onChangeSettings={(patch) => void changeSettings(patch)} onOpenSettings={openSettings} />}
    {activeTab?.url.startsWith('local://search?') && <SearchResults url={activeTab.url} privateWindow={snapshot.privateWindow} />}
    {activeTab?.url === 'local://extensions' && <Extensions settings={snapshot.settings} onChange={(patch) => void changeSettings(patch)} />}
    {settingsOpen && <Settings settings={snapshot.settings} onClose={closeSettings} onChange={(patch) => void changeSettings(patch)} />}
    {permission && <div className="permission-toast"><div><b>{permission.origin}</b><span>wants to use your {permission.permission}.</span></div><button onClick={() => { void window.local.respondPermission(permission.id, false); setPermission(null); }}>Don’t allow</button><button className="allow" onClick={() => { void window.local.respondPermission(permission.id, true); setPermission(null); }}>Allow once</button></div>}
    {download && <div className="download-toast"><span><Icon name={download.status === 'completed' ? 'check' : 'download'} size={16} /></span><div><b>{download.filename}</b><i style={{ width: `${Math.round(download.progress * 100)}%` }} /></div></div>}
  </div>;
}
