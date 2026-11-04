import { COMMUNITY, DEFAULTS, communityUrl, normalizePreferences, type FeaturePreferences, type NativeAction, type Preferences } from './model';

export type ToolActions = {
  preferences: (value: FeaturePreferences) => void;
  pin: (name: string) => void;
  unpin: (name: string) => void;
  navigate: (url: string) => void;
  native: (action: NativeAction) => void;
};

// One set of controls serves the installed native bar, compact reader and preview.
// Dialogs escape the bar's clipping and supply browser-native focus trapping.
export function mountTools(reader: HTMLElement, actions: ToolActions) {
  const controls = reader.querySelector('.view-controls')!;
  const container = document.createElement('div'); container.className = 'reader-tools';
  container.innerHTML = `<button type="button" class="communities-tool" aria-label="Community shortcuts" aria-haspopup="dialog">Shortcuts</button><button type="button" class="preferences-tool" aria-haspopup="dialog">Preferences</button><button type="button" class="title-filter-summary" hidden></button>`;
  controls.append(container);
  const settings = document.createElement('dialog'); settings.className = 'tools-dialog preferences-dialog'; settings.setAttribute('aria-labelledby', 'pureddit-preferences-heading');
  settings.innerHTML = `<form class="preferences-form">
    <div class="dialog-heading"><h2 id="pureddit-preferences-heading">Make room for your feed</h2><button type="button" class="close-dialog" aria-label="Close preferences">×</button></div>
    <p class="tools-hint">Saved on this browser. Reddit keeps handling your account and media.</p>
    <fieldset><legend>Reading</legend><div class="reading-fields">
      <div><label for="pureddit-text-size">Text size</label><select id="pureddit-text-size" name="textSize"><option value="default">Default</option><option value="large">Large</option><option value="larger">Larger</option></select></div>
      <div><label for="pureddit-content-width">Content width</label><select id="pureddit-content-width" name="contentWidth"><option value="automatic">Automatic</option><option value="focused">Focused</option><option value="wide">Wide</option></select></div>
      <div><label for="pureddit-density">Spacing</label><select id="pureddit-density" name="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>
    </div></fieldset>
    <fieldset><legend>Hide distractions</legend><p class="tools-hint">Applies to supported Reddit sidebar panels. Joined communities and subreddit rules stay available.</p>
      <label class="check-field"><input type="checkbox" name="games">Games</label><label class="check-field"><input type="checkbox" name="explore">Explore</label>
      <label class="check-field"><input type="checkbox" name="recentPosts">Recent posts panel</label><label class="check-field"><input type="checkbox" name="recommended">Recommended community panels</label>
    </fieldset>
    <fieldset><legend>Title filters</legend><label for="pureddit-title-filters">Words or phrases to hide</label><textarea id="pureddit-title-filters" name="titleFilters" rows="4" maxlength="3029" placeholder="One phrase per line"></textarea><p class="tools-hint">Up to 30 phrases, 100 characters each. Case-insensitive, literal matching in feed titles only. Filtered posts can be revealed from the top bar.</p></fieldset>
    <fieldset><legend>Keyboard navigation</legend><label class="check-field"><input type="checkbox" name="keyboard">Enable desktop keyboard shortcuts</label><p class="tools-hint">J / K: next / previous post · Enter or O: open post · C: comments · Esc: return after opening a post with a shortcut. Inactive in editors, search and menus.</p></fieldset>
    <p class="tools-status" role="status"></p><div class="dialog-actions"><button type="button" class="reset-features">Reset these preferences</button><button type="submit" class="save-features">Save preferences</button></div>
  </form>`;
  const communities = document.createElement('dialog'); communities.className = 'tools-dialog communities-dialog'; communities.setAttribute('aria-labelledby', 'pureddit-communities-heading');
  communities.innerHTML = `<div class="dialog-heading"><h2 id="pureddit-communities-heading">Your shortcuts</h2><button type="button" class="close-dialog" aria-label="Close communities">×</button></div>
    <label for="pureddit-community-search">Search shortcuts and recent communities</label><input id="pureddit-community-search" type="search" autocomplete="off" placeholder="Find a community">
    <div class="community-results"></div><form class="tool-pin-form"><label for="pureddit-pin-name">Pin a community</label><div class="pin-entry"><input id="pureddit-pin-name" maxlength="23" placeholder="r/community" autocomplete="off" required><button type="submit">Pin</button></div></form>
    <p class="tools-status" role="status"></p><p class="tools-hint">Pinning is local to Pureddit and does not join a subreddit.</p><button type="button" class="open-subscriptions">Open Reddit communities ↗</button>`;
  reader.append(settings, communities);
  let preferences = normalizePreferences(DEFAULTS), signature = '';
  const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string) => settings.querySelector<T>(`[name="${name}"]`)!;
  const populate = () => {
    for (const name of ['textSize', 'contentWidth', 'density'] as const) field<HTMLSelectElement>(name).value = preferences.reading[name];
    for (const name of ['games', 'explore', 'recentPosts', 'recommended'] as const) field<HTMLInputElement>(name).checked = preferences.distractions[name];
    field<HTMLTextAreaElement>('titleFilters').value = preferences.titleFilters.join('\n'); field<HTMLInputElement>('keyboard').checked = preferences.keyboard;
    settings.querySelector('.tools-status')!.textContent = '';
  };
  container.querySelector('.preferences-tool')!.addEventListener('click', () => { communities.close(); populate(); settings.showModal(); });
  container.querySelector('.communities-tool')!.addEventListener('click', () => { settings.close(); communities.showModal(); });
  for (const dialog of [settings, communities]) {
    dialog.querySelector('.close-dialog')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => { if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();} });
  }
  settings.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    const lines = field<HTMLTextAreaElement>('titleFilters').value.split('\n').map(line => line.trim()).filter(Boolean);
    const status = settings.querySelector('.tools-status')!;
    if (lines.length > 30 || lines.some(line => line.length > 100)) { status.textContent = 'Use at most 30 phrases, with no more than 100 characters per phrase.'; return; }
    const next = normalizePreferences({ ...preferences,
      reading: { textSize: field('textSize').value, contentWidth: field('contentWidth').value, density: field('density').value },
      distractions: Object.fromEntries(['games','explore','recentPosts','recommended'].map(name => [name,field<HTMLInputElement>(name).checked])),
      titleFilters: lines, keyboard: field<HTMLInputElement>('keyboard').checked,
    });
    actions.preferences(next); settings.close();
  });
  settings.querySelector('.reset-features')!.addEventListener('click', () => { actions.preferences(normalizePreferences({ ...preferences, ...featureDefaults() })); populate(); });
  const search = communities.querySelector<HTMLInputElement>('input[type=search]')!;
  function renderCommunities() {
    const results = communities.querySelector('.community-results')!; results.replaceChildren();
    const query = search.value.trim().replace(/^r\//i, '').toLowerCase(); let matches = 0;
    for (const [heading, names] of [['Recent communities', preferences.recent], ['Pinned communities', preferences.pins]] as const) {
      const section = document.createElement('section'), title = document.createElement('h3'); title.textContent = heading; section.append(title);
      for (const name of names.filter(name => name.toLowerCase().includes(query))) {
        matches++; const row = document.createElement('div'); row.className = 'tool-community-row';
        const link = document.createElement('a'); link.textContent = `r/${name}`; link.href = communityUrl(name);
        link.onclick = event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); communities.close(); actions.navigate(link.href); } };
        row.append(link);
        const pinned = preferences.pins.some(value => value.toLowerCase() === name.toLowerCase());
        const button = document.createElement('button'); button.type = 'button'; button.textContent = pinned ? 'Unpin' : 'Pin'; button.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} r/${name}`);
        button.onclick = () => { if (pinned) actions.unpin(preferences.pins.find(value => value.toLowerCase() === name.toLowerCase())!); else actions.pin(name); };
        button.disabled = !pinned && preferences.pins.length >= 50; row.append(button); section.append(row);
      }
      if (section.childElementCount > 1) results.append(section);
    }
    if (!matches) { const empty = document.createElement('p'); empty.className = 'tools-hint'; empty.textContent = query ? 'No matching shortcuts or recent communities.' : 'Pin a community below, or visit one on Reddit to add it to your recents.'; results.append(empty); }
  }
  search.addEventListener('input', renderCommunities);
  communities.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault(); const input = communities.querySelector<HTMLInputElement>('#pureddit-pin-name')!;
    const name = input.value.trim().replace(/^r\//i, ''); const status = communities.querySelector('.tools-status')!;
    if (!COMMUNITY.test(name)) { status.textContent = 'Use a community name with 2–21 letters, numbers or underscores.'; return; }
    if (preferences.pins.length >= 50) { status.textContent = 'You can pin up to 50 communities. Unpin one first.'; return; }
    actions.pin(name); input.value = ''; status.textContent = `Pinned r/${name}.`;
  });
  communities.querySelector('.open-subscriptions')!.addEventListener('click', () => { communities.close(); actions.native('navigation'); });
  let filterHandler = () => {};
  const summary = container.querySelector<HTMLButtonElement>('.title-filter-summary')!; summary.onclick = () => filterHandler();
  return {
    update(next: Preferences) {
      preferences = next;
      const key = JSON.stringify([next.pins,next.recent]); if (key !== signature) { signature = key; renderCommunities(); }
    },
    filters(count: number, revealed: boolean, toggle: () => void) {
      summary.hidden = count === 0; summary.textContent = `${count} ${count === 1 ? 'post' : 'posts'} ${revealed ? 'revealed · Hide again' : 'filtered · Show'}`;
      summary.setAttribute('aria-pressed', String(revealed)); filterHandler = toggle;
    },
    close() { settings.close(); communities.close(); },
    isOpen: () => settings.open || communities.open,
  };
}

export const featureDefaults = (): FeaturePreferences => ({ distractions: { ...DEFAULTS.distractions }, reading: { ...DEFAULTS.reading }, titleFilters: [], keyboard: false });
