import type { Settings } from '../../shared/types';
import { Icon } from '../components/Icon';

interface Props {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
}

export function Extensions({ settings, onChange }: Props) {
  const enabled = settings.adBlockerEnabled;
  return <main className="extensions-page">
    <div className="extensions-layout">
      <header className="extensions-heading">
        <span className="extensions-mark"><Icon name="puzzle" size={25} /></span>
        <div><p className="eyebrow">LOCAL</p><h1>Extensions</h1><p>Small tools, with clear access and local controls.</p></div>
      </header>

      <section className="extension-list" aria-label="Installed extensions">
        <article className={`extension-card ${enabled ? 'enabled' : 'paused'}`}>
          <div className="extension-icon"><Icon name="block" size={25} /></div>
          <div className="extension-details">
            <div className="extension-title"><h2>AdBlocker</h2><span>Built in</span></div>
            <p>Blocks common advertising requests with rules bundled inside Local, before the ads load.</p>
            <small>{enabled ? 'On for websites you visit' : 'Paused for all websites'} · Reload open pages after changing this.</small>
          </div>
          <label className="extension-switch">
            <span>{enabled ? 'On' : 'Off'}</span>
            <input className="toggle" type="checkbox" checked={enabled} onChange={(event) => onChange({ adBlockerEnabled: event.target.checked })} aria-label="Enable AdBlocker" />
          </label>
        </article>
      </section>

      <p className="extensions-footnote">AdBlocker does not send visited URLs to Local. Its bundled rules catch many common ads, but no blocker can guarantee every ad on every website.</p>
    </div>
  </main>;
}
