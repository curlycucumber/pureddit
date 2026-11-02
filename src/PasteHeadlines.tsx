import { useState, type ClipboardEvent } from 'react';
import { ClipboardPaste, ExternalLink, Trash2, X } from 'lucide-react';
import { extractHeadlines, headlineSearch, MAX_PASTE_LENGTH, type HeadlineImport } from './headline-import';

type Feed = 'popular' | 'news';
type Draft = { text: string; html: string; imported: HeadlineImport | null; error: string };
const emptyDraft = (): Draft => ({ text: '', html: '', imported: null, error: '' });

export default function PasteHeadlines({ feed }: { feed: Feed }) {
  const [drafts, setDrafts] = useState<Record<Feed, Draft>>(() => ({ popular: emptyDraft(), news: emptyDraft() }));
  const draft = drafts[feed];
  function update(value: Partial<Draft>) { setDrafts(previous => ({ ...previous, [feed]: { ...previous[feed], ...value } })); }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (text.length > MAX_PASTE_LENGTH) { update({ error: 'Paste fewer than 200,000 characters at a time.' }); return; }
    update({ text, html: event.clipboardData.getData('text/html'), error: '' });
  }
  function extract() {
    try {
      const imported = extractHeadlines(draft.text, draft.html);
      update({ imported, error: imported.headlines.length ? '' : 'No headlines were recognized. Try copying a selection containing post titles, or paste one headline per line.' });
    } catch (error) { update({ error: error instanceof Error ? error.message : 'Could not read this paste.' }); }
  }
  function remove(index: number) {
    if (!draft.imported) return;
    update({ imported: { ...draft.imported, headlines: draft.imported.headlines.filter((_, item) => item !== index) } });
  }
  return <section className="paste-reader" aria-label="Paste headlines">
    <div className="paste-instructions"><h2>Import from your clipboard</h2><ol><li><a href={`https://www.reddit.com/r/${feed}/`} target="_blank" rel="noopener noreferrer">Open r/{feed}<ExternalLink size={12} /></a> in your browser.</li><li>Select the visible post titles or page text and copy it.</li><li>Paste below, then extract and review the headlines.</li></ol><p>Everything is processed in this tab. Pureddit does not upload or persist the pasted content, or request anything from Reddit. Reloading clears your imports.</p></div>
    <form className="paste-form" onSubmit={event => { event.preventDefault(); extract(); }}>
      <label htmlFor="pasted-headlines">Copied text from r/{feed}</label>
      <textarea id="pasted-headlines" value={draft.text} maxLength={MAX_PASTE_LENGTH} onPaste={paste} onChange={event => update({ text: event.target.value, html: '', error: '' })} placeholder="Paste copied Reddit page text or one headline per line…" rows={7} spellCheck={false} />
      <p className="paste-hint">{draft.html ? 'Links included in your copied selection can be preserved.' : 'Text-only titles get a Reddit search link; exact post links are not guessed.'} Page text varies; review the results and remove anything that isn’t a headline. Up to 200 titles per import.</p>
      <div className="paste-form-actions"><button className="button primary" type="submit" disabled={!draft.text.trim() && !draft.html}><ClipboardPaste size={15} />Extract headlines</button><button className="button" type="button" disabled={!draft.text && !draft.imported} onClick={() => setDrafts(previous => ({ ...previous, [feed]: emptyDraft() }))}><Trash2 size={14} />Clear r/{feed}</button><span>{draft.text.length.toLocaleString()} characters</span></div>
    </form>
    {draft.error && <p className="paste-error" role="alert">{draft.error}</p>}
    {draft.imported && draft.imported.headlines.length > 0 && <>
      <div className="paste-result-heading"><h2>Imported headlines</h2><span role="status">{draft.imported.headlines.length} {draft.imported.headlines.length === 1 ? 'headline' : 'headlines'} · {draft.imported.method === 'clipboard-links' ? 'Copied links' : 'Text extraction'}</span></div>
      <div className="feed reader-feed">{draft.imported.headlines.map((headline, index) => <article className="reader-post pasted-post" key={`${headline.title}-${index}`}>
        <div className="reader-post-content"><div className="reader-post-meta"><span>Pasted from r/{feed}</span>{headline.community && <><span>·</span><span>r/{headline.community}</span></>}</div><h3><a className="post-title" href={headline.url || headlineSearch(headline.title)} target="_blank" rel="noopener noreferrer">{headline.title}</a></h3><a className="pasted-link" href={headline.url || headlineSearch(headline.title)} target="_blank" rel="noopener noreferrer">{headline.url ? 'Open original post' : 'Search on Reddit'}<ExternalLink size={12} /></a></div>
        <button className="icon-button" type="button" aria-label={`Remove headline: ${headline.title}`} onClick={() => remove(index)}><X size={16} /></button>
      </article>)}</div>
    </>}
    <footer className="content-footer"><span>Pureddit · Manual import</span><span>Local to this tab · No automatic updates</span></footer>
  </section>;
}
