import { useEffect, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import type { PersonProfile, SearchCategory, SearchResponse, SearchResult } from '../../shared/types';
import { Icon } from '../components/Icon';

interface Props { url: string; privateWindow: boolean; }

export function SearchResults({ url, privateWindow }: Props) {
  const query = queryFromUrl(url);
  const category = categoryFromUrl(url);
  const [value, setValue] = useState(query);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    setValue(query);
    setResponse(null);
    setError('');
    setSelectedImageIndex(null);
    void window.local.search(query, category).then((next) => { if (current) setResponse(next); }).catch((reason) => {
      if (current) setError(searchError(reason));
    });
    return () => { current = false; };
  }, [query, category, requestKey]);

  const images = category === 'images' ? response?.results ?? [] : [];
  useEffect(() => {
    if (selectedImageIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedImageIndex(null);
      if (event.key === 'ArrowLeft') setSelectedImageIndex((index) => index === null ? null : (index - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setSelectedImageIndex((index) => index === null ? null : (index + 1) % images.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedImageIndex, images.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) void window.local.navigate(value);
  };

  return <><main className="search-page">
    <div className="search-scroll"><div className="search-layout">
      <header className="search-header">
        <span className="search-wordmark">Local.</span>
        <form className="results-search" onSubmit={submit}>
          <Icon name="search" size={18} />
          <input value={value} onChange={(event) => setValue(event.target.value)} aria-label="Search the web" />
          <button type="submit" aria-label="Search"><Icon name="arrow-right" size={17} /></button>
        </form>
        <nav className="search-tabs" role="tablist" aria-label="Search categories">
          {categories.map((item) => <button key={item.id} role="tab" aria-selected={category === item.id} className={category === item.id ? 'active' : ''} onClick={() => void window.local.navigate(searchUrl(query, item.id))}>{item.label}</button>)}
          {privateWindow && <small><Icon name="lock" size={11} /> Private</small>}
        </nav>
      </header>

      <section className="results-list" aria-live="polite">
        {!response && !error && <SearchSkeleton />}
        {error && <div className="search-message"><span><Icon name="search" size={20} /></span><h1>Search is unavailable.</h1><p>{error}</p><button onClick={() => setRequestKey((key) => key + 1)}>Try again</button></div>}
        {response && !response.results.length && <div className="search-message"><span><Icon name="search" size={20} /></span><h1>No results found.</h1><p>Try a shorter or more general search.</p></div>}
        {response?.person && <PersonPanel person={response.person} />}
        {response?.overview && <Overview response={response} />}
        {response && <CategoryResults category={category} results={response.results} privateWindow={privateWindow} onPreviewImage={setSelectedImageIndex} />}
        {response && <p className="search-attribution">{response.attribution ?? `Search results provided by ${response.provider}.`}</p>}
      </section>
    </div></div>{selectedImageIndex !== null && images[selectedImageIndex] && <ImagePreview results={images} index={selectedImageIndex} privateWindow={privateWindow} onSelect={setSelectedImageIndex} onClose={() => setSelectedImageIndex(null)} />}
  </main></>;
}

function CategoryResults({ category, results, privateWindow, onPreviewImage }: { category: SearchCategory; results: SearchResult[]; privateWindow: boolean; onPreviewImage(index: number): void }) {
  if (category === 'images') return <div className="image-results">{results.map((result, index) => <ImageResult key={result.id} result={result} index={index} privateWindow={privateWindow} onPreview={() => onPreviewImage(index)} />)}</div>;
  if (category === 'videos') return <div className="video-results">{results.map((result, index) => <VideoResult key={result.id} result={result} index={index} privateWindow={privateWindow} />)}</div>;
  if (category === 'news') return <div className="news-results">{results.map((result, index) => <NewsResult key={result.id} result={result} index={index} privateWindow={privateWindow} />)}</div>;
  if (category === 'shopping') return <div className="shopping-results">{results.map((result, index) => <ShoppingResult key={result.id} result={result} index={index} privateWindow={privateWindow} />)}</div>;
  return <div className={category === 'forums' ? 'forum-results' : 'web-results'}>{results.map((result, index) => <WebResult key={result.id} result={result} index={index} privateWindow={privateWindow} discussion={category === 'forums'} />)}</div>;
}

function WebResult({ result, index, privateWindow, discussion }: ResultProps & { discussion: boolean }) {
  return <article className={`search-result ${discussion ? 'discussion-result' : ''}`} style={delay(index)}>
    <button className="result-main" onClick={() => open(result.url)}>
      <Source result={result} />
      <h2>{result.title}</h2>
      {result.snippet && <p>{result.snippet}</p>}
    </button>
    <Bookmark result={result} hidden={privateWindow} />
  </article>;
}

function ImageResult({ result, index, privateWindow, onPreview }: ResultProps & { onPreview(): void }) {
  return <article className="image-result" style={{ ...delay(index), '--image-ratio': result.width && result.height ? `${result.width} / ${result.height}` : '4 / 3' } as CSSProperties}>
    <button onClick={onPreview} aria-label={`Preview ${result.title}`}>{result.thumbnailUrl ? <img src={result.thumbnailUrl} alt={result.title} loading="lazy" referrerPolicy="no-referrer" /> : <MediaFallback result={result} />}<span><b>{result.title}</b><small>{result.creator || result.source}{result.license ? ` · ${result.license}` : ''}</small></span></button>
    <Bookmark result={result} hidden={privateWindow} />
  </article>;
}

function ImagePreview({ results, index, privateWindow, onSelect, onClose }: { results: SearchResult[]; index: number; privateWindow: boolean; onSelect(index: number): void; onClose(): void }) {
  const result = results[index];
  const selectRelative = (offset: number) => onSelect((index + offset + results.length) % results.length);
  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose(); };
  return <div className="image-preview-backdrop" onMouseDown={closeFromBackdrop}>
    <section className="image-preview" role="dialog" aria-modal="true" aria-label={`Image preview: ${result.title}`}>
      <header><span><i>W</i><b>{result.source}</b></span><nav><button onClick={() => selectRelative(-1)} aria-label="Previous image"><Icon name="arrow-left" size={17} /></button><button onClick={() => selectRelative(1)} aria-label="Next image"><Icon name="arrow-right" size={17} /></button><button onClick={onClose} aria-label="Close preview"><Icon name="x" size={18} /></button></nav></header>
      <div className="image-preview-stage" key={result.id}>{result.thumbnailUrl ? <img src={result.thumbnailUrl} alt={result.title} referrerPolicy="no-referrer" /> : <MediaFallback result={result} />}</div>
      <div className="image-preview-copy">
        <small>{index + 1} of {results.length}</small><h1>{result.title}</h1>
        <p>{[result.creator, result.license].filter(Boolean).join(' · ') || 'License and attribution details are available on the source page.'}</p>
        <div><button className="preview-visit" onClick={() => open(result.url)}>Visit source <Icon name="external" size={14} /></button>{!privateWindow && <button className="preview-save" onClick={() => void window.local.addBookmarkUrl({ title: result.title, url: result.url })}><Icon name="bookmark" size={15} /> Save</button>}</div>
      </div>
    </section>
  </div>;
}

function PersonPanel({ person }: { person: PersonProfile }) {
  return <aside className="person-panel" aria-label={`About ${person.name}`}>
    <div className="person-copy"><span className="person-label">Person</span><h1>{person.name}</h1><p className="person-description">{person.description}</p>{person.extract && <p className="person-extract">{person.extract}</p>}<button onClick={() => open(person.sourceUrl)}>Read on Wikipedia <Icon name="external" size={13} /></button></div>
    {person.imageUrl && <button className="person-image" onClick={() => open(person.sourceUrl)}><img src={person.imageUrl} alt={person.name} referrerPolicy="no-referrer" /></button>}
    {!!person.facts.length && <dl>{person.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
    <small className="person-source">Information from Wikipedia and Wikidata</small>
  </aside>;
}

function VideoResult({ result, index, privateWindow }: ResultProps) {
  return <article className="video-result" style={delay(index)}><button onClick={() => open(result.url)}><div className="media-thumbnail">{result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <MediaFallback result={result} />}{result.duration && <span>{result.duration}</span>}<i><Icon name="play" size={18} /></i></div><h2>{result.title}</h2><p>{result.creator || result.source}{result.age ? ` · ${result.age}` : ''}</p></button><Bookmark result={result} hidden={privateWindow} /></article>;
}

function NewsResult({ result, index, privateWindow }: ResultProps) {
  return <article className="news-result" style={delay(index)}><button onClick={() => open(result.url)}>{result.thumbnailUrl && <img src={result.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}<span><small>{result.source}{result.age ? ` · ${result.age}` : ''}</small><h2>{result.title}</h2>{result.snippet && <p>{result.snippet}</p>}</span></button><Bookmark result={result} hidden={privateWindow} /></article>;
}

function ShoppingResult({ result, index, privateWindow }: ResultProps) {
  return <article className="shopping-result" style={delay(index)}><button onClick={() => open(result.url)}><div>{result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <MediaFallback result={result} />}</div><small>{result.source}</small><h2>{result.title}</h2>{result.price && <b className="result-price">{result.price}</b>}</button><Bookmark result={result} hidden={privateWindow} /></article>;
}

function Source({ result }: { result: SearchResult }) { return <span className="result-source"><i>{sourceInitial(result.source)}</i><span><b>{result.source}</b><small>{displayUrl(result.url)}</small></span></span>; }
function Bookmark({ result, hidden }: { result: SearchResult; hidden: boolean }) { return hidden ? null : <button className="result-bookmark" aria-label={`Bookmark ${result.title}`} onClick={() => void window.local.addBookmarkUrl({ title: result.title, url: result.url })}><Icon name="bookmark" size={16} /></button>; }
function MediaFallback({ result }: { result: SearchResult }) { return <span className="media-fallback">{sourceInitial(result.source)}</span>; }

interface ResultProps { result: SearchResult; index: number; privateWindow: boolean; }
function delay(index: number): CSSProperties { return { '--result-index': index } as CSSProperties; }
function open(url: string): void { void window.local.navigate(url); }

const categories: Array<{ id: SearchCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'news', label: 'News' },
  { id: 'forums', label: 'Forums' },
  { id: 'shopping', label: 'Shopping' },
];

function Overview({ response }: { response: SearchResponse }) {
  return <aside className="local-overview" aria-labelledby="overview-heading">
    <span className="overview-aura" aria-hidden="true"><i /><i /><i /></span>
    <header><span><Icon name="sparkle" size={16} /><b id="overview-heading">Overview</b></span><small>On-device</small></header>
    <ul>{response.overview!.points.map((point) => <li key={point}>{point}</li>)}</ul>
    <div className="overview-sources">
      <span>From search excerpts</span>
      {response.overview!.sources.map((source, index) => <button key={source.url} title={source.title} onClick={() => void window.local.navigate(source.url)}>{index + 1} · {source.source}</button>)}
    </div>
    <p>Assembled locally from result snippets. It may be incomplete or inaccurate.</p>
  </aside>;
}

function SearchSkeleton() {
  return <div className="search-skeleton" aria-label="Searching"><div /><div /><div /><div /></div>;
}

function queryFromUrl(url: string): string {
  try { return new URL(url).searchParams.get('q') ?? ''; }
  catch { return ''; }
}
function categoryFromUrl(url: string): SearchCategory {
  try {
    const category = new URL(url).searchParams.get('category');
    return categories.some(({ id }) => id === category) ? category as SearchCategory : 'all';
  } catch { return 'all'; }
}
function searchUrl(query: string, category: SearchCategory): string { return `local://search?q=${encodeURIComponent(query)}&category=${category}`; }
function searchError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : '';
  if (message.includes('request limit')) return 'The search source’s request limit has been reached. Try again later.';
  return 'Local couldn’t reach the search provider. Check your connection and try again.';
}
function sourceInitial(source: string): string { return source.replace(/^www\./, '').charAt(0).toUpperCase() || '•'; }
function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch { return url; }
}
