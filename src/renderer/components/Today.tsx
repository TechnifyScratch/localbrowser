import { useEffect, useState } from 'react';
import type { TodayItem } from '../../shared/types';
import { Icon } from './Icon';

export function Today() {
  const [items, setItems] = useState<TodayItem[] | null>(null);
  useEffect(() => { void window.local.getTodayItems().then(setItems); }, []);

  const save = async (item: TodayItem) => {
    await window.local.addBookmarkUrl({ title: item.title, url: item.url });
    setItems((current) => current?.map((entry) => entry.id === item.id ? { ...entry, kind: 'saved' } : entry) ?? current);
  };

  return <section className="today-section" aria-labelledby="today-heading">
    <div className="section-heading"><h2 id="today-heading">Today</h2><span>Recent from this Mac</span></div>
    {items?.length ? <div className="article-grid">
      {items.map((item) => <article className="article-card activity-card" key={item.id}>
        <button className="article-open" onClick={() => void window.local.navigate(item.url)} aria-label={`Open ${item.title}`}>
          <div className={`activity-visual tone-${toneFor(item.source)} ${item.thumbnailDataUrl ? 'has-thumbnail' : ''}`}>{item.thumbnailDataUrl && <img src={item.thumbnailDataUrl} alt="" />}<span>{initials(item.source)}</span><small>{item.kind === 'saved' ? 'Saved' : relativeTime(item.timestamp)}</small></div>
          <div className="article-copy"><h3>{item.title || item.source}</h3><p>{item.source}</p></div>
        </button>
        <button className={`article-save ${item.kind === 'saved' ? 'saved' : ''}`} aria-label={item.kind === 'saved' ? 'Saved' : `Bookmark ${item.title}`} disabled={item.kind === 'saved'} onClick={() => void save(item)}><Icon name={item.kind === 'saved' ? 'check' : 'bookmark'} size={17} /></button>
      </article>)}
    </div> : <div className="today-empty"><span><Icon name="history" size={21} /></span><div><h3>Your recent pages will appear here.</h3><p>Local builds this view from history and bookmarks stored on this Mac—nothing is sent away.</p></div></div>}
  </section>;
}

function toneFor(source: string): number { return [...source].reduce((total, character) => total + character.charCodeAt(0), 0) % 4; }
function initials(source: string): string {
  if (source === 'localhost') return 'LO';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(source)) return 'IP';
  const name = source.split('.')[0].replace(/[-_]/g, ' ').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase();
}
function relativeTime(timestamp: number): string {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}
