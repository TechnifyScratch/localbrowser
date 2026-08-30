import { useEffect, useMemo, useState } from 'react';
import type { AppSnapshot, ExtensionPopupView, Settings } from '../shared/types';
import { ExtensionsPopover } from './components/ExtensionsPopover';

export function ExtensionPopupApp() {
  const initialView = useMemo<ExtensionPopupView>(() => new URLSearchParams(location.search).get('view') === 'adblocker' ? 'adblocker' : 'list', []);
  const [view, setView] = useState<ExtensionPopupView>(initialView);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  useEffect(() => { void window.local.getSnapshot().then(setSnapshot); }, []);
  useEffect(() => { void window.local.resizeExtensionsPopup(view); }, [view]);
  const changeSettings = async (patch: Partial<Settings>) => {
    const settings = await window.local.updateSettings(patch);
    setSnapshot((current) => current ? { ...current, settings } : current);
  };
  if (!snapshot) return null;
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId);
  return <ExtensionsPopover
    view={view}
    activeUrl={active?.url ?? ''}
    settings={snapshot.settings}
    onView={setView}
    onChange={(patch) => void changeSettings(patch)}
    onClose={() => void window.local.closeExtensionsPopup()}
    onManage={() => void window.local.openExtensions()}
  />;
}
