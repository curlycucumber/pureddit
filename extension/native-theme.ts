import type { Preferences } from '../shared/model';

// Override page appearance locally; never update Reddit account preferences.
export function nativeTheme(preferences: Preferences) {
  const dark=preferences.colorScheme==='dark';
  const background=dark?'#101214':'#ffffff',soft=dark?'#252c31':'#f1f5f8',text=dark?'#e7e9ec':'#26343f',muted=dark?'#a8b4bc':'#5c6c79',border=dark?'#394249':'#d5dfe8',link=dark?'#80a7ff':'#0756a6';
  const values:Record<string,string>={};
  for(const suffix of ['', '-weak','-strong','-container'])values[`neutral-background${suffix}`]=background;
  for(const suffix of ['-hover','-selected'])values[`neutral-background${suffix}`]=soft;
  for(const suffix of ['', '-strong'])values[`neutral-content${suffix}`]=text;
  for(const suffix of ['-weak','-disabled'])values[`neutral-content${suffix}`]=muted;
  for(const suffix of ['', '-weak','-medium','-strong'])values[`neutral-border${suffix}`]=border;
  for(const [index,value] of [text,muted,muted,border,border,soft,background].entries())values[`tone-${index+1}`]=value;
  values.primary=link;values['secondary-background']=soft;values['secondary-content']=text;
  const tokens=Object.entries(values).map(([name,value])=>`--color-${name}:${value}!important;`).join('');
  const declarations=`color-scheme:${dark?'dark':'light'}!important;${tokens}color:${text};background-color:${background};`;
  const rules=(scope:string)=>`
${scope} .bg-neutral-background,${scope} .bg-neutral-background-weak,${scope} .bg-neutral-background-strong,${scope} .bg-tone-7 {background-color:${background}!important;}
${scope} .text-neutral-content,${scope} .text-neutral-content-strong,${scope} .text-tone-1,${scope} [slot=title],${scope} h1,${scope} h2,${scope} h3 {color:${text}!important;}
${scope} .text-neutral-content-weak,${scope} .text-tone-2 {color:${muted}!important;}`;
  return {declarations,rules};
}
