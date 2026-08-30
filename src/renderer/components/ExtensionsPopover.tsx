import type { Settings } from '../../shared/types';
import { Icon } from './Icon';

export type ExtensionPopoverView = 'list' | 'adblocker';

interface Props {
  view: ExtensionPopoverView;
  activeUrl: string;
  settings: Settings;
  onView(view: ExtensionPopoverView): void;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
  onManage(): void;
}

export function ExtensionsPopover({ view, activeUrl, settings, onView, onChange, onClose, onManage }: Props) {
  if (view === 'adblocker') return <section className="extension-popover adblocker-popover" role="dialog" aria-label="AdBlocker">
    <header>
      <button className="popover-back" onClick={() => onView('list')} aria-label="Back to extensions"><Icon name="arrow-left" size={17} /></button>
      <b>AdBlocker</b>
      <button className="popover-close" onClick={onClose} aria-label="Close extensions"><Icon name="x" size={17} /></button>
    </header>
    <div className="adblocker-hero">
      <span className={settings.adBlockerEnabled ? 'active' : ''}><Icon name="block" size={27} /></span>
      <h2>{settings.adBlockerEnabled ? 'Protection is on' : 'Protection is paused'}</h2>
      <p>{siteLabel(activeUrl)}</p>
    </div>
    <label className="adblocker-control">
      <span><b>Block on websites</b><small>Ads, trackers, and cookie notices</small></span>
      <input className="toggle" type="checkbox" checked={settings.adBlockerEnabled} onChange={(event) => onChange({ adBlockerEnabled: event.target.checked })} />
    </label>
    <p className="adblocker-note">Uses offline EasyList, EasyPrivacy, and uBlock Origin-compatible filter rules. Reload this page after changing protection.</p>
    <button className="extension-manage" onClick={onManage}><Icon name="sliders" size={17} /> Manage extensions</button>
  </section>;

  return <section className="extension-popover" role="dialog" aria-label="Extensions">
    <header><b>Extensions</b><button className="popover-close" onClick={onClose} aria-label="Close extensions"><Icon name="x" size={17} /></button></header>
    <p className="extension-popover-intro">Installed in Local</p>
    <button className="extension-popover-row" onClick={() => onView('adblocker')}>
      <span className={`extension-mini-icon ${settings.adBlockerEnabled ? 'active' : ''}`}><Icon name="block" size={19} /></span>
      <span className="extension-popover-copy"><b>AdBlocker</b><small>{settings.adBlockerEnabled ? 'Active on websites' : 'Paused'}</small></span>
      <span
        className={`extension-pin ${settings.adBlockerPinned ? 'pinned' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={settings.adBlockerPinned ? 'Unpin AdBlocker' : 'Pin AdBlocker'}
        aria-pressed={settings.adBlockerPinned}
        onClick={(event) => { event.stopPropagation(); onChange({ adBlockerPinned: !settings.adBlockerPinned }); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onChange({ adBlockerPinned: !settings.adBlockerPinned }); }
        }}
      ><Icon name={settings.adBlockerPinned ? 'pin' : 'pin-off'} size={18} /></span>
      <Icon name="chevron-right" size={16} />
    </button>
    <button className="extension-manage" onClick={onManage}><Icon name="sliders" size={17} /> Manage extensions</button>
  </section>;
}

function siteLabel(url: string): string {
  if (!url || url.startsWith('local://')) return 'Local pages do not need filtering';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'This website'; }
}
