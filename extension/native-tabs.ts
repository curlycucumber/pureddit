import { feedControl } from './native';
import { NEWS_URL, type HomeMode } from '../shared/model';

// Change only text/accessible labels, retaining Reddit's actual buttons/events.
export class NativeTabs {
  private newsLinks = new Map<HTMLAnchorElement,string>();
  news(roots:Array<Document|ShadowRoot>) {
    for(const root of roots){const selector=root instanceof ShadowRoot && root.host.closest('nav, aside, [role=navigation], shreddit-left-nav')?'a[href]':'nav a[href], aside a[href], [role=navigation] a[href], shreddit-left-nav a[href]';
      for(const link of root.querySelectorAll<HTMLAnchorElement>(selector))if((link.getAttribute('aria-label')||link.textContent||'').replace(/\s+/g,' ').trim()==='News' && !link.closest('shreddit-post, article')){
        if(!this.newsLinks.has(link)){this.newsLinks.set(link,link.getAttribute('href')!);link.setAttribute('data-pureddit-news','');}
        if(link.href!==NEWS_URL)link.href=NEWS_URL;
      }
    }
    for(const link of this.newsLinks.keys())if(!link.isConnected)this.newsLinks.delete(link);
  }
  isNews(path:EventTarget[]) {return path.some(node=>node instanceof HTMLAnchorElement&&this.newsLinks.has(node));}
  private text = new Map<Text,{before:string;after:string}>();
  private aria = new Map<HTMLElement,{before:string;after:string}>();
  private controls = new Map<Element,HomeMode>();
  apply(roots: Array<Document|ShadowRoot>) {
    this.controls.clear();
    for(const [mode,name] of [['following','Your Feed'],['for-you','Suggested Feed']] as const){
      const control=feedControl(mode,roots);if(!control)continue;this.controls.set(control,mode);
      const pattern=mode==='following'?/^following$/i:/^(for\s*you|suggested)$/i;
      const walker=document.createTreeWalker(control,NodeFilter.SHOW_TEXT);let current:Node|null;
      while((current=walker.nextNode()))if(pattern.test(current.textContent!.trim())){const node=current as Text;const before=node.data,after=before.replace(before.trim(),name);this.text.set(node,{before,after});node.data=after;}
      const label=control.getAttribute('aria-label');if(label&&pattern.test(label.trim())){this.aria.set(control,{before:label,after:name});control.setAttribute('aria-label',name);}
    }
    for(const node of this.text.keys())if(!node.isConnected)this.text.delete(node);
    for(const node of this.aria.keys())if(!node.isConnected)this.aria.delete(node);
  }
  mode(path: EventTarget[]) {for(const node of path)if(node instanceof Element&&this.controls.has(node))return this.controls.get(node);}
  ownMutation(record: MutationRecord) {return record.target instanceof Text&&this.text.get(record.target)?.after===record.target.data || record.attributeName==='aria-label'&&record.target instanceof HTMLElement&&this.aria.get(record.target)?.after===record.target.getAttribute('aria-label');}
  clearHome() {
    for(const [node,value] of this.text)if(node.data===value.after)node.data=value.before;
    for(const [node,value] of this.aria)if(node.getAttribute('aria-label')===value.after)node.setAttribute('aria-label',value.before);
    this.text.clear();this.aria.clear();this.controls.clear();
  }
  clear() { this.clearHome();for(const [link,before] of this.newsLinks){if(link.href===NEWS_URL)link.setAttribute('href',before);link.removeAttribute('data-pureddit-news');}this.newsLinks.clear(); }
}
