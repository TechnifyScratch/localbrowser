import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Collection, Settings } from '../../shared/types';
import { Collections } from '../components/Collections';
import { Icon } from '../components/Icon';
import { Today } from '../components/Today';

interface Props {
  privateWindow: boolean;
  settings: Settings;
  onChangeSettings(patch: Partial<Settings>): void;
  onOpenSettings(): void;
}

export function NewTab({ privateWindow, settings, onChangeSettings, onOpenSettings }: Props) {
  const [query, setQuery] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [panel, setPanel] = useState<'privacy' | 'customize' | null>(null);
  useEffect(() => { if (!privateWindow) void window.local.getCollections().then(setCollections); }, [privateWindow]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) void window.local.navigate(query); };

  return <main className={`new-tab ${privateWindow ? 'private-home' : ''}`}>
    <div className="dashboard-scroll"><div className="dashboard">
      <section className="home-hero">
        {privateWindow && <div className="private-kicker"><Icon name="lock" size={13} />Private session</div>}
        <h1>Local.</h1>
        <form className="hero-search" onSubmit={submit}><Icon name="search" size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search or enter a website" placeholder="Search or enter a website" /><button className="accent-submit" aria-label="Go" type="submit"><Icon name="arrow-right" size={18} /></button></form>
        {privateWindow && <p className="private-message">This session won’t be retained by Local.</p>}
      </section>
      {!privateWindow && settings.showCollections && <Collections collections={collections} onChange={setCollections} />}
      {!privateWindow && settings.showToday && <Today />}
      {!privateWindow && !settings.showCollections && !settings.showToday && <div className="quiet-home"><p>Your homepage is clear.</p><button onClick={() => setPanel('customize')}>Choose what to show</button></div>}
    </div></div>
    <footer className="home-footer">
      <button onClick={() => setPanel('privacy')}><Icon name="shield" size={18} /><span>Privacy is on</span></button>
      <button onClick={() => setPanel('customize')}><Icon name="sliders" size={18} /><span>Customize</span></button>
    </footer>
    {panel === 'privacy' && <PrivacySummary settings={settings} onClose={() => setPanel(null)} onOpenSettings={() => { setPanel(null); onOpenSettings(); }} />}
    {panel === 'customize' && <Customize settings={settings} privateWindow={privateWindow} onChange={onChangeSettings} onClose={() => setPanel(null)} onOpenSettings={() => { setPanel(null); onOpenSettings(); }} />}
  </main>;
}

function PrivacySummary({ settings, onClose, onOpenSettings }: { settings: Settings; onClose(): void; onOpenSettings(): void }) {
  return <Panel title="Privacy" icon="shield" onClose={onClose}>
    <p className="panel-intro">Local’s browser controls are active. Websites you visit still communicate with their own servers.</p>
    <div className="privacy-list">
      <StatusRow label="Third-party cookies" value={settings.blockThirdPartyCookies ? 'Blocked' : 'Allowed'} active={settings.blockThirdPartyCookies} />
      <StatusRow label="Tracking parameters" value={settings.stripTrackingParameters ? 'Stripped' : 'Kept'} active={settings.stripTrackingParameters} />
      <StatusRow label="Local data" value="Stored on this Mac" active />
    </div>
    <button className="panel-link" onClick={onOpenSettings}>Open privacy settings <Icon name="chevron-right" size={15} /></button>
  </Panel>;
}

function Customize({ settings, privateWindow, onChange, onClose, onOpenSettings }: { settings: Settings; privateWindow: boolean; onChange(patch: Partial<Settings>): void; onClose(): void; onOpenSettings(): void }) {
  return <Panel title="Customize" icon="sliders" onClose={onClose}>
    {!privateWindow && <div className="customize-group"><h3>Homepage</h3><ToggleRow label="Show Collections" checked={settings.showCollections} onChange={(value) => onChange({ showCollections: value })} /><ToggleRow label="Show Today" checked={settings.showToday} onChange={(value) => onChange({ showToday: value })} /></div>}
    <div className="customize-group"><h3>Appearance</h3><div className="appearance-row"><span><i className="light-swatch" />Light</span><Icon name="check" size={16} /></div></div>
    <button className="panel-link" onClick={onOpenSettings}>Privacy and browser settings <Icon name="chevron-right" size={15} /></button>
  </Panel>;
}

function Panel({ title, icon, onClose, children }: { title: string; icon: 'shield' | 'sliders'; onClose(): void; children: ReactNode }) {
  return <div className="home-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="home-panel" role="dialog" aria-modal="true" aria-label={title}><header><span><Icon name={icon} size={18} /><h2>{title}</h2></span><button onClick={onClose} aria-label={`Close ${title}`}><Icon name="x" size={17} /></button></header>{children}</aside></div>;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="customize-row"><span>{label}</span><input className="toggle" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
function StatusRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return <div><span className={active ? 'status-active' : ''}><Icon name={active ? 'check' : 'x'} size={13} /></span><b>{label}</b><small>{value}</small></div>;
}
