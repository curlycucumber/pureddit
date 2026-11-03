import type { ColorScheme } from '../shared/model';
import { nativeControl } from './native';
type Root = Document | ShadowRoot;
type Result = 'selected' | 'unavailable' | 'canceled';
const displayOpener = /^(display mode|appearance|color theme|colour theme|theme)(?:\s*(light|dark|automatic|system|use device settings))?$/i;
const display = /^(display mode|appearance|color theme|colour theme|theme)$/i;
function settingContext(element:Element) {
  let current:Element|null=element;while(current){if(current.closest('shreddit-post, .thing.link, shreddit-comment, shreddit-comment-tree, [data-testid=post-container], [contenteditable=true]'))return false;const root=current.getRootNode();current=root instanceof ShadowRoot?root.host:null;}return true;
}
const enabled = (element: HTMLElement) => settingContext(element) && !element.matches(':disabled, [aria-disabled=true]') && !element.closest('[hidden]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length > 0;
function name(element: Element) {
  const labelled = element.getAttribute('aria-labelledby');
  const root = element.getRootNode() as Document | ShadowRoot;
  const labels = (element as HTMLInputElement).labels;
  return (element.getAttribute('aria-label') || (labelled ? labelled.split(/\s+/).map(id=>root.querySelector(`#${CSS.escape(id)}`)?.textContent||'').join(' ') : '') || (labels?.length ? [...labels].map(label=>label.textContent).join(' ') : '') || element.textContent || '').replace(/\s+/g,' ').trim();
}
function matchesMode(text:string,mode:ColorScheme){return new RegExp(`^${mode}(?: mode)?$`,'i').test(text.trim());}
function choice(element: Element, mode: ColorScheme) { return matchesMode(name(element),mode); }
function checked(element: Element) {
  return element.matches('input:checked, option:checked') || element.getAttribute('aria-checked') === 'true' || element.getAttribute('aria-selected') === 'true' || element.getAttribute('data-state') === 'checked';
}
export function renderedDisplayMode(): ColorScheme | undefined {
  for (const root of [document.documentElement, document.body, document.querySelector('shreddit-app')]) {
    if (!root) continue;
    if (root.classList.contains('theme-dark')) return 'dark';
    if (root.classList.contains('theme-light')) return 'light';
    const value=root.getAttribute('data-theme') || root.getAttribute('theme');
    if (value==='dark'||value==='light') return value;
  }
}

// Use only Reddit's own visible UI. Never infer persistence from our CSS, read
// tokens, invoke private application state or construct account API requests.
export class DisplayModeController {
  private generation=0;
  private opened = new Set<HTMLElement>();
  busy=false;
  cancel() { this.generation++;this.busy=false;this.opened.clear(); }
  async set(mode: ColorScheme, roots: ()=>Root[], beforeClick: ()=>void): Promise<Result> {
    const generation=++this.generation;this.busy=true;
    let displayOpened=false,accountOpened=false;
    const tried=new WeakSet<Element>();
    const click=(element:HTMLElement)=>{beforeClick();element.click();};
    const deadline=Date.now()+2200;
    try {
      while(generation===this.generation && Date.now()<deadline) {
        const current=roots();
        // Reddit's current menu, identified from the native theme-option markup.
        for(const root of current)for(const option of root.querySelectorAll<HTMLElement>('[data-testid^="theme-option-"] [role=option]'))if(choice(option,mode)&&enabled(option)){
          const before=renderedDisplayMode();
          const changed=!checked(option);if(changed)click(option);
          return await this.confirm(option,()=>option.isConnected?checked(option):this.selectedTrigger(roots(),mode)||before!==mode&&renderedDisplayMode()===mode,roots,generation,click,changed);
        }
        // Native selects expose option values directly; do not guess values.
        for(const root of current) for(const select of root.querySelectorAll<HTMLSelectElement>('select')) if(display.test(name(select)) && enabled(select)) {
          const option=[...select.options].find(option=>choice(option,mode));if(!option || option.disabled)continue;
          const changed=select.value!==option.value;if(changed){beforeClick();select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true,composed:true}));select.dispatchEvent(new Event('change',{bubbles:true,composed:true}));}
          return await this.confirm(select,()=>select.isConnected&&select.value===option.value,roots,generation,click,changed);
        }
        const groups:HTMLElement[]=[];
        for(const root of current) {
          for(const group of root.querySelectorAll<HTMLElement>('fieldset,[role=radiogroup],[role=group]')) if(display.test(name(group)) || display.test(group.querySelector('legend')?.textContent?.trim()||''))groups.push(group);
          for(const label of root.querySelectorAll<HTMLElement>('label,legend,h2,h3'))if(display.test(name(label))){const group=label.closest<HTMLElement>('fieldset,[role=group],section')||label.parentElement;if(group)groups.push(group);}
          if(displayOpened)groups.push(...root.querySelectorAll<HTMLElement>('[role=menu],[role=listbox],[role=dialog]'));
        }
        for(const group of groups)for(const option of group.querySelectorAll<HTMLElement>('input[type=radio],[role=radio],[role=menuitemradio],[role=option]'))if(choice(option,mode)&&enabled(option)) {
          const changed=!checked(option);if(changed)click(option);
          return await this.confirm(group,()=>option.isConnected&&checked(option) || displayOpened&&this.selectedTrigger(roots(),mode),roots,generation,click,changed);
        }
        // A native Dark Mode switch is an explicit setting, unlike root classes.
        for(const root of current)for(const toggle of root.querySelectorAll<HTMLElement>('[role=switch],input[type=checkbox]'))if(/^dark mode$/i.test(name(toggle))&&enabled(toggle)){
          const automatic=[...root.querySelectorAll<HTMLElement>('[role=switch],input[type=checkbox]')].find(node=>/^(use (device|system) (theme|settings)|automatic dark mode)$/i.test(name(node))&&enabled(node));
          const changed=checked(toggle)!==(mode==='dark')||Boolean(automatic&&checked(automatic));
          if(automatic&&checked(automatic))click(automatic);
          if(checked(toggle)!==(mode==='dark'))click(toggle);
          return await this.confirm(toggle.parentElement||toggle,()=>toggle.isConnected&&checked(toggle)===(mode==='dark')&&(!automatic||!checked(automatic)),roots,generation,click,changed);
        }
        let opener:HTMLElement|undefined;
        for(const root of current){opener=[...root.querySelectorAll<HTMLElement>('button,[role=menuitem],[role=button],[role=combobox]')].find(node=>displayOpener.test(name(node))&&enabled(node)&&!tried.has(node));if(opener)break;}
        if(opener){tried.add(opener);displayOpened=true;if(opener.getAttribute('aria-expanded')!=='true'){click(opener);this.opened.add(opener);}}
        else if(!accountOpened){const account=nativeControl('account',current);if(!account||!enabled(account))return 'unavailable';accountOpened=true;if(account.getAttribute('aria-expanded')!=='true'){click(account);this.opened.add(account);}}
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      return generation!==this.generation?'canceled':'unavailable';
    } finally {
      if(generation===this.generation){this.busy=false;for(const opener of [...this.opened].reverse())if(opener.isConnected&&opener.getAttribute('aria-expanded')==='true')click(opener);this.opened.clear();}
    }
  }
  private selectedTrigger(roots:Root[],mode:ColorScheme) {
    return roots.some(root=>[...root.querySelectorAll<HTMLElement>('[role=combobox],button[aria-haspopup]')].some(element=>displayOpener.test(name(element))&&matchesMode((element.getAttribute('aria-valuetext')||element.textContent||'').replace(/^(display mode|appearance|color theme|colour theme|theme)\s*/i,''),mode)));
  }
  private async confirm(scope:HTMLElement,selected:()=>boolean,roots:()=>Root[],generation:number,click:(node:HTMLElement)=>void,changed:boolean):Promise<Result> {
    // Allow Reddit to flush its native change handler before inspecting Save.
    await new Promise(resolve=>setTimeout(resolve,40));
    if(generation!==this.generation)return 'canceled';
    // Only save inside the identified display group, never an unrelated profile form.
    const group=scope.matches('fieldset,[role=group]')?scope:scope.closest<HTMLElement>('fieldset,[role=group]');
    const identified=group&&(display.test(name(group))||display.test(group.querySelector('legend')?.textContent?.trim()||''));
    const save=identified && [...group.querySelectorAll<HTMLButtonElement>('button')].find(button=>/^(save|save changes|apply)$/i.test(name(button)));
    if(save){
      const deadline=Date.now()+500;
      while(changed&&!enabled(save)&&generation===this.generation&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
      if(generation!==this.generation)return 'canceled';
      if(enabled(save))click(save);else if(changed)return 'unavailable';
    }
    await new Promise(resolve=>setTimeout(resolve,160));
    if(generation!==this.generation)return 'canceled';
    const error=roots().some(root=>[...root.querySelectorAll<HTMLElement>('[role=alert]')].some(node=>enabled(node)&&/(failed|unable|could not|couldn.t|error)/i.test(node.textContent||'')));
    return !error&&selected()?'selected':'unavailable';
  }
}
