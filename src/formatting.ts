// Small, deliberately limited Markdown renderer. User HTML is always plain text.
export function renderFormatted(text: string, target: HTMLElement) {
  target.replaceChildren();
  let list: HTMLOListElement | HTMLUListElement | undefined;
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const tag = /\d/.test(bullet[1]) ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== tag) { list = document.createElement(tag); target.append(list); }
      const item = document.createElement('li'); inline(bullet[2], item); list.append(item); continue;
    }
    list = undefined;
    if (!line.trim()) continue;
    const quote = line.startsWith('> '), paragraph = document.createElement(quote ? 'blockquote' : 'p');
    inline(quote ? line.slice(2) : line, paragraph); target.append(paragraph);
  }
}
function inline(text: string, target: HTMLElement, depth = 0) {
  if (depth > 8) { target.append(document.createTextNode(text)); return; }
  const tokens = /\*\*([^\n]+?)\*\*|(?<!\*)\*([^*\n]+)\*(?!\*)|`([^`\n]+)`/g;
  let end = 0;
  for (const match of text.matchAll(tokens)) {
    target.append(document.createTextNode(text.slice(end, match.index)));
    const element = document.createElement(match[1] !== undefined ? 'strong' : match[2] !== undefined ? 'em' : 'code');
    const value = match[1] ?? match[2] ?? match[3];
    if (match[3] !== undefined) element.textContent = value; else inline(value, element, depth + 1);
    target.append(element); end = match.index! + match[0].length;
  }
  target.append(document.createTextNode(text.slice(end)));
}
export function formattingTools(textarea: HTMLTextAreaElement) {
  const toolbar = document.createElement('div'); toolbar.className = 'format-toolbar'; toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Text formatting');
  const preview = document.createElement('div'); preview.className = 'format-preview'; preview.hidden = true; preview.setAttribute('aria-label', 'Formatted preview');
  for (const [label, text, marker] of [['Bold','B','**'],['Italic','I','*'],['Bulleted list','• List','- '],['Numbered list','1. List','1. '],['Quote','Quote','> '],['Inline code','Code','`']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.title = label; button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      const start = textarea.selectionStart, end = textarea.selectionEnd, selection = textarea.value.slice(start, end);
      const block = marker.endsWith(' ');
      const value = block ? (selection || 'List item').split('\n').map((line, index) => `${marker === '1. ' ? `${index + 1}. ` : marker}${line}`).join('\n') : `${marker}${selection || 'text'}${marker}`;
      const prefix = block && start > 0 && textarea.value[start - 1] !== '\n' ? '\n' : '';
      if (textarea.value.length - (end - start) + prefix.length + value.length > textarea.maxLength) return;
      textarea.setRangeText(prefix + value, start, end, 'end');
      if (!block) textarea.setSelectionRange(start + marker.length, start + value.length - marker.length);
      textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.focus();
    }); toolbar.append(button);
  }
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Preview'; toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => { preview.hidden = !preview.hidden; toggle.setAttribute('aria-pressed', String(!preview.hidden)); renderFormatted(textarea.value, preview); }); toolbar.append(toggle);
  textarea.addEventListener('input', () => { if (!preview.hidden) renderFormatted(textarea.value, preview); });
  return { toolbar, preview };
}
