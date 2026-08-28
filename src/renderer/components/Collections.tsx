import { useState, type FormEvent } from 'react';
import type { Collection, CollectionColor } from '../../shared/types';
import { Icon } from './Icon';

interface Props { collections: Collection[]; onChange(collections: Collection[]): void; }
type Editor = { mode: 'create' } | { mode: 'open' | 'rename'; collection: Collection };
const colors: CollectionColor[] = ['violet', 'blue', 'coral', 'green'];

export function Collections({ collections, onChange }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const remove = async (collection: Collection) => {
    if (!confirm(`Delete “${collection.name}” and its saved sites?`)) return;
    onChange(await window.local.deleteCollection(collection.id));
    setMenuId(null);
  };

  return <section className="collections-section" aria-labelledby="collections-heading">
    <div className="section-heading"><h2 id="collections-heading">Collections</h2><span>Saved on this Mac</span></div>
    <div className="collection-row">
      {collections.map((collection) => <article className="collection-card" key={collection.id} onClick={() => setEditor({ mode: 'open', collection })}>
        <span className={`folder-mark ${collection.color}`}><Icon name="folder" size={25} /></span>
        <span className="collection-copy"><b>{collection.name}</b><small>{collection.items.length} {collection.items.length === 1 ? 'item' : 'items'}</small></span>
        <button className="collection-menu-button" aria-label={`Options for ${collection.name}`} onClick={(event) => { event.stopPropagation(); setMenuId(menuId === collection.id ? null : collection.id); }}><Icon name="more" size={18} /></button>
        {menuId === collection.id && <div className="popover-menu" onClick={(event) => event.stopPropagation()}>
          <button onClick={() => { setEditor({ mode: 'open', collection }); setMenuId(null); }}><Icon name="external" size={14} />Open</button>
          <button onClick={() => { setEditor({ mode: 'rename', collection }); setMenuId(null); }}><Icon name="edit" size={14} />Rename</button>
          <button className="destructive" onClick={() => void remove(collection)}><Icon name="trash" size={14} />Delete</button>
        </div>}
      </article>)}
      <button className="new-collection-card" onClick={() => setEditor({ mode: 'create' })}><Icon name="plus" size={19} /><span>New collection</span></button>
    </div>
    {editor && <CollectionEditor editor={editor} onClose={() => setEditor(null)} onChange={(next) => { onChange(next); const current = 'collection' in editor ? next.find(({ id }) => id === editor.collection.id) : undefined; if (current) setEditor({ mode: 'open', collection: current }); else setEditor(null); }} />}
  </section>;
}

function CollectionEditor({ editor, onClose, onChange }: { editor: Editor; onClose(): void; onChange(collections: Collection[]): void }) {
  const collection = 'collection' in editor ? editor.collection : undefined;
  const [name, setName] = useState(collection?.name ?? '');
  const [color, setColor] = useState<CollectionColor>(collection?.color ?? 'violet');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);

  const saveCollection = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const next = editor.mode === 'create' ? await window.local.createCollection({ name, color }) : await window.local.renameCollection(collection!.id, name);
      onChange(next);
      setRenaming(false);
    } catch (reason) { setError((reason as Error).message); }
  };
  const addItem = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try { onChange(await window.local.addCollectionItem(collection!.id, { title, url })); setTitle(''); setUrl(''); }
    catch (reason) { setError((reason as Error).message); }
  };

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="collection-dialog" role="dialog" aria-modal="true" aria-label={editor.mode === 'create' ? 'New collection' : collection?.name}>
    <header><div className={`folder-mark large ${collection?.color ?? color}`}><Icon name="folder" size={27} /></div><div><h3>{editor.mode === 'create' ? 'New collection' : collection!.name}</h3><p>{editor.mode === 'open' ? `${collection!.items.length} saved locally` : 'Keep related sites together.'}</p></div><button className="dialog-close" onClick={onClose}><Icon name="x" /></button></header>
    {editor.mode !== 'open' || renaming ? <form className="collection-form" onSubmit={saveCollection}>
      <label>Name<input autoFocus value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="Collection name" /></label>
      {editor.mode === 'create' && <fieldset><legend>Accent</legend><div className="color-options">{colors.map((option) => <button type="button" key={option} className={`${option} ${color === option ? 'selected' : ''}`} onClick={() => setColor(option)} aria-label={`${option} accent`}><Icon name="check" size={14} /></button>)}</div></fieldset>}
      {error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" onClick={() => renaming ? setRenaming(false) : onClose()}>Cancel</button><button className="primary-small" disabled={!name.trim()}>{editor.mode === 'create' ? 'Create' : 'Save name'}</button></div>
    </form> : <>
      <div className="collection-items">{collection!.items.length ? collection!.items.map((item) => <div className="collection-item" key={item.id}><button className="site-link" onClick={() => void window.local.navigate(item.url)}><span>{item.title.slice(0, 1).toUpperCase()}</span><span><b>{item.title}</b><small>{domain(item.url)}</small></span></button><button className="remove-site" aria-label={`Remove ${item.title}`} onClick={() => void window.local.removeCollectionItem(collection!.id, item.id).then(onChange)}><Icon name="x" size={15} /></button></div>) : <div className="empty-collection"><Icon name="bookmark" size={22} /><p>No saved sites yet.</p><span>Add the first one below.</span></div>}</div>
      <form className="add-site-form" onSubmit={addItem}><h4>Add a site</h4><div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Name" aria-label="Site name" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com" aria-label="Site URL" /><button disabled={!title.trim() || !url.trim()} aria-label="Add site"><Icon name="plus" size={17} /></button></div>{error && <p className="form-error">{error}</p>}</form>
      <footer><button onClick={() => setRenaming(true)} className="rename-inline"><Icon name="edit" size={14} /> Rename collection</button></footer>
    </>}
  </section></div>;
}

function domain(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
