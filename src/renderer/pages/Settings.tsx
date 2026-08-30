import { useEffect, useState, type ReactNode } from 'react';
import type { Settings as SettingsType, UpdateState } from '../../shared/types';
import { Icon } from '../components/Icon';

interface Props { settings: SettingsType; onChange(patch: Partial<SettingsType>): void; }

export function Settings({ settings, onChange }: Props) {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  useEffect(() => {
    void window.local.getUpdateState().then(setUpdate);
    return window.local.onUpdateState(setUpdate);
  }, []);
  const download = () => { if (confirm(`Download Local ${update?.availableVersion ?? 'update'} from GitHub Releases?`)) void window.local.downloadUpdate(); };
  const install = () => {
    const prompt = update?.delivery === 'dmg' ? 'Open the verified DMG now? You’ll drag Local into Applications to replace the current version.' : 'Relaunch Local and install the downloaded update now?';
    if (confirm(prompt)) void window.local.installUpdate();
  };
  return <main className="settings-page">
    <div className="settings-layout">
    <header className="settings-heading"><span className="settings-mark"><Icon name="sliders" size={25} /></span><div><p className="eyebrow">LOCAL</p><h1>Settings</h1><p>Simple controls for browsing, privacy, and data stored on this Mac.</p></div></header>
    <SettingsSection title="Privacy">
      <Toggle label="Block third-party cookies" detail="May sign you out of some embedded services." checked={settings.blockThirdPartyCookies} onChange={(value) => onChange({ blockThirdPartyCookies: value })} />
      <Toggle label="Strip tracking parameters" detail="Removes common campaign identifiers from links." checked={settings.stripTrackingParameters} onChange={(value) => onChange({ stripTrackingParameters: value })} />
    </SettingsSection>
    <SettingsSection title="Browsing">
      <label className="setting-row"><span><b>External results page</b><small>Used when Local’s results interface is turned off.</small></span><select value={settings.searchProvider} onChange={(event) => onChange({ searchProvider: event.target.value as SettingsType['searchProvider'] })}><option value="duckduckgo">DuckDuckGo</option><option value="brave">Brave Search</option><option value="google">Google</option></select></label>
      <Toggle label="Show results in Local" detail="Uses Local’s interface; disabling it opens the selected engine’s page." checked={settings.localSearchResults} onChange={(value) => onChange({ localSearchResults: value })} />
      <div className="setting-row"><span><b>Built-in search tabs</b><small>All tabs work without an account, API key, or Local server.</small></span><Icon name="check" size={17} /></div>
      <Toggle label="Open previous session" checked={settings.openPreviousSession} onChange={(value) => onChange({ openPreviousSession: value })} />
      <Toggle label="Show bookmarks bar" checked={settings.showBookmarksBar} onChange={(value) => onChange({ showBookmarksBar: value })} />
    </SettingsSection>
    <SettingsSection title="Homepage">
      <Toggle label="Show Collections" checked={settings.showCollections} onChange={(value) => onChange({ showCollections: value })} />
      <Toggle label="Show Today" detail="Shows recent history and bookmarks stored on this Mac." checked={settings.showToday} onChange={(value) => onChange({ showToday: value })} />
    </SettingsSection>
    <SettingsSection title="Updates" aside="Via GitHub Releases">
      <Toggle label="Automatically check for updates" detail="Checks GitHub Releases for a new version. Downloads still require your approval." checked={settings.automaticUpdateChecks} onChange={(value) => onChange({ automaticUpdateChecks: value })} />
      <div className="update-row">
        <div><b>{updateTitle(update)}</b><small>{update?.message ?? 'Loading update status…'}</small>{update?.status === 'downloading' && <i><span style={{ width: `${update.progress ?? 0}%` }} /></i>}</div>
        {update?.status === 'available' && <button className="update-primary" onClick={download}>Download</button>}
        {update?.status === 'downloaded' && <button className="update-primary" onClick={install}>{update.delivery === 'dmg' ? 'Open installer' : 'Relaunch to update'}</button>}
        {!['available', 'downloaded', 'downloading', 'checking', 'unavailable'].includes(update?.status ?? '') && <button onClick={() => void window.local.checkForUpdates()}>Check now</button>}
      </div>
    </SettingsSection>
    <SettingsSection title="Data" aside="Stored only on this Mac"><div className="data-actions"><button onClick={() => void window.local.clearData('history')}>Clear history</button><button onClick={() => void window.local.clearData('siteData')}>Clear cookies & site data</button><button className="danger" onClick={() => { if (confirm('Clear all Local browsing data and settings?')) void window.local.clearData('all'); }}>Clear all Local data</button></div></SettingsSection>
    <footer><button onClick={() => void window.local.openPrivateWindow()}>New private window</button><span>Local {update?.currentVersion ?? '0.18.1'}</span></footer>
    </div>
  </main>;
}

function updateTitle(update: UpdateState | null): string {
  if (!update) return 'Updates';
  if (update.status === 'available') return `Local ${update.availableVersion} is available`;
  if (update.status === 'downloaded') return 'Ready to relaunch';
  if (update.status === 'downloading') return `Downloading · ${Math.round(update.progress ?? 0)}%`;
  if (update.status === 'checking') return 'Checking for updates';
  if (update.status === 'not-available') return 'You’re up to date';
  if (update.status === 'error') return 'Update check failed';
  if (update.status === 'unavailable') return 'Updates need setup';
  return 'Updates';
}

function SettingsSection({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return <section className="settings-section"><div className="section-title"><h2>{title}</h2>{aside && <span>{aside}</span>}</div><div className="settings-card">{children}</div></section>;
}
function Toggle({ label, detail, checked, disabled = false, onChange }: { label: string; detail?: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void }) {
  return <label className={`setting-row ${disabled ? 'disabled-row' : ''}`}><span><b>{label}</b>{detail && <small>{detail}</small>}</span><input className="toggle" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}
