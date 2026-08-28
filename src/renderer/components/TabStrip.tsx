import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { TabState } from '../../shared/types';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

interface Props {
  tabs: TabState[];
  activeTabId: string | null;
  privateWindow: boolean;
}

export function TabStrip({ tabs, activeTabId, privateWindow }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tabElements = useRef(new Map<string, HTMLDivElement>());
  const previousRects = useRef(new Map<string, DOMRect>());
  const layoutKey = tabs.map((tab) => `${tab.id}:${tab.pinned}`).join('|');

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    tabElements.current.forEach((element, id) => {
      const next = element.getBoundingClientRect();
      nextRects.set(id, next);
      const previous = previousRects.current.get(id);
      if (!previous || reduceMotion) return;
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 300, easing: 'cubic-bezier(.16, 1, .3, 1)' },
      );
    });
    previousRects.current = nextRects;
  }, [layoutKey]);

  const drop = (event: DragEvent, target: TabState) => {
    event.preventDefault();
    if (draggingId) void window.local.reorderTab(draggingId, target.id);
    setDraggingId(null);
    setDropTargetId(null);
  };

  return <div className="tab-strip" role="tablist" aria-label="Open tabs">
    <div className="traffic-space" />
    <div className="tabs-scroll">
      {tabs.map((tab) => <div
        key={tab.id}
        ref={(element) => { if (element) tabElements.current.set(tab.id, element); else tabElements.current.delete(tab.id); }}
        className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${draggingId === tab.id ? 'dragging' : ''} ${dropTargetId === tab.id ? 'drop-target' : ''}`}
        role="tab"
        tabIndex={0}
        aria-selected={tab.id === activeTabId}
        title={tab.pinned ? tab.title : undefined}
        draggable
        onClick={() => void window.local.activateTab(tab.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') void window.local.activateTab(tab.id); }}
        onContextMenu={(event) => { event.preventDefault(); void window.local.showTabContextMenu(tab.id); }}
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingId(tab.id); }}
        onDragOver={(event) => {
          const source = tabs.find(({ id }) => id === draggingId);
          if (source?.pinned === tab.pinned) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropTargetId(tab.id);
          }
        }}
        onDragLeave={() => setDropTargetId((current) => current === tab.id ? null : current)}
        onDrop={(event) => drop(event, tab)}
        onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}
      >
        <Favicon tab={tab} />
        {!tab.pinned && <span className="tab-title">{tab.title}</span>}
        {!tab.pinned && <button className="tab-close" aria-label={`Close ${tab.title}`} onClick={(event) => { event.stopPropagation(); void window.local.closeTab(tab.id); }}><Icon name="x" size={14} /></button>}
        {tab.pinned && tab.loading && <span className="pinned-loading" />}
      </div>)}
    </div>
    <IconButton label="New tab" icon="plus" onClick={() => void window.local.newTab()} />
    <button className="tab-overview-button" aria-label={`${tabs.length} open tabs`} onClick={() => void window.local.showTabOverview()}><Icon name="tabs" size={17} /><span>{tabs.length}</span></button>
    {privateWindow && <span className="private-label"><Icon name="lock" size={12} />Private</span>}
  </div>;
}

function Favicon({ tab }: { tab: TabState }) {
  return <span className="favicon-slot"><span className="local-favicon">{faviconLetter(tab)}</span>{tab.favicon && <img className="tab-favicon" src={tab.favicon} alt="" onError={(event) => event.currentTarget.remove()} />}</span>;
}

function faviconLetter(tab: TabState): string {
  if (tab.url.startsWith('local://')) return 'L';
  try {
    const hostname = new URL(tab.url).hostname;
    return hostname === 'localhost' || /^\d/.test(hostname) ? '•' : hostname.replace(/^www\./, '')[0].toUpperCase();
  } catch {
    return tab.title[0]?.toUpperCase() ?? 'L';
  }
}
