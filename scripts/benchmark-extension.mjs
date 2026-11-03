import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.addInitScript(()=>{globalThis.browser={storage:{local:{async get(){return {};},async set(){}},onChanged:{addListener(){}}}};});
 const cards=Array.from({length:300},(_,i)=>`<shreddit-post post-title="Story ${i}" subreddit-name="news" permalink="/r/news/comments/bench${i}/title/" score="1" comment-count="5"><img slot="post-media-preview" src="https://i.redd.it/bench${i}.jpg"></shreddit-post>`).join('');
 const decor='<div><span>Native layout</span><button>Control</button></div>'.repeat(3000);
 await page.route('https://www.reddit.com/**',r=>r.fulfill({contentType:'text/html',body:`<html><body><section id="native">${cards}${decor}</section></body></html>`}));
 await page.route('https://i.redd.it/**',r=>r.abort());
 await page.goto('https://www.reddit.com/r/news/');await page.addScriptTag({path:'dist/extensions/chrome/content.js'});
 await page.waitForFunction(()=>document.querySelector('#pureddit-extension-root')?.shadowRoot?.querySelectorAll('article').length===300);
 await page.waitForTimeout(300);
 const result=await page.evaluate(async()=>{
  const root=document.querySelector('#pureddit-extension-root').shadowRoot;
  const originalCards=[...root.querySelectorAll('article')];let fullScans=0,parsed=0;
  const dq=document.querySelectorAll.bind(document);document.querySelectorAll=s=>{if(s==='*')fullScans++;return dq(s);};
  const eq=Element.prototype.querySelector;Element.prototype.querySelector=function(s){if(s.startsWith('img[slot="post-media-preview"]'))parsed++;return eq.call(this,s);};
  const samples=[];
  for(let i=0;i<5;i++){
   const start=performance.now();document.querySelector('shreddit-post').setAttribute('score',String(100+i));
   await new Promise(resolve=>{const o=new MutationObserver(()=>{if(root.querySelector('.score-number')?.textContent===String(100+i)){o.disconnect();resolve();}});o.observe(root,{subtree:true,childList:true,characterData:true});});
   samples.push(performance.now()-start);
  }
  const retained=originalCards.filter(node=>node.isConnected).length;
  const scansDuringUpdates=fullScans;fullScans=0;
  await new Promise(resolve=>setTimeout(resolve,3200));
  return {posts:300,nativeDecorNodes:9000,updateSamplesMs:samples,medianUpdateMs:[...samples].sort((a,b)=>a-b)[2],unchangedCardsRetained:retained,parsedCards:parsed,fullDocumentScansDuringUpdates:scansDuringUpdates,fullDocumentScansDuringIdle:fullScans};
 });
 result.contentBytes=(await readFile('dist/extensions/chrome/content.js')).length;
 console.log(JSON.stringify(result,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
} finally {await browser.close();}
