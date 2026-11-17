const cv=document.querySelector('canvas'),cx=cv.getContext('2d'),hint=document.querySelector('#hint');let shot=null,start=0,phase='effect',portrait=null,petAt=null;
async function makePortrait(d){if(d.mascot!=='dex')return;const [m,a,b]=await Promise.all([fetch('manifest.json').then(r=>r.json()),load('3-sprites-dex.png'),load('4-sprites-dex2.png')]);const tmp=document.createElement('canvas');tmp.width=tmp.height=320;const c=tmp.getContext('2d'),boxes={};for(const [n,seq] of Object.entries(m)){if(!n.startsWith('dex-')||n==='dex-hit-wobble')continue;boxes[n]=seq.map(f=>{c.clearRect(0,0,320,320);c.drawImage(f.a===3?b:a,f.x,f.y,320,320,0,0,320,320);return SpriteFit.alphaBBox(c.getImageData(0,0,320,320).data,320,320,40);});}const fit=SpriteFit.buildFitTable(boxes,{cell:320,canvas:320}),i=Math.floor(m['dex-rage'].length*.78),f=m['dex-rage'][i],q=fit.table['dex-rage'].frames[i];c.clearRect(0,0,320,320);c.drawImage(a,f.x+q.bx,f.y+q.by,q.bw,q.bh,q.dx,q.dy,q.dw,q.dh);portrait=tmp;}
function load(url){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url;});}
function clearShot(){if(shot){const old=shot;shot=null;old.onload=null;old.onerror=null;old.src='';}cx.clearRect(0,0,cv.width,cv.height);}
window.furyAPI.onInit(d=>{cv.width=innerWidth;cv.height=innerHeight;petAt=d.petAt;makePortrait(d).catch(()=>{});shot=new Image();shot.onload=()=>{start=performance.now();requestAnimationFrame(draw);};shot.onerror=()=>{clearShot();window.furyAPI.cancel();};shot.src=d.image;d.image='';});
function draw(t){if(phase!=='effect'||!shot)return;const u=Math.min(1,(t-start)/4500),w=cv.width,h=cv.height;cx.clearRect(0,0,w,h);cx.drawImage(shot,0,0,w,h);const k=Math.floor(u*24);let r=(()=>{let s=k*9841+17;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
 for(let j=0;j<3+u*15;j++){let y=r()*h,bh=4+r()*(4+u*23),dx=(r()-.5)*(10+u*130);cx.drawImage(shot,0,y*shot.height/h,shot.width,bh*shot.height/h,dx,y,w,bh);cx.fillStyle=j%2?'#00bad51c':'#d836751c';cx.fillRect(dx,y,w,bh);}
 for(let j=0;j<5+u*18;j++){cx.fillStyle=j%3?'#5cb3c877':'#ca5b9477';cx.fillRect(r()*w,r()*h,6+r()*50,2);}
 if(u>.78){cx.fillStyle='#080c12';for(let j=0;j<(u-.78)*65;j++)cx.fillRect(0,j*h/14,w,h/30);}
 if(portrait&&petAt){cx.drawImage(portrait,petAt.x,petAt.y,petAt.w,petAt.h);}
 requestAnimationFrame(draw);
}
window.furyAPI.onState(s=>{phase=s.phase;if(phase==='blackout'){clearShot();portrait=null;hint.style.display='none';cx.fillStyle='#000';cx.fillRect(0,0,cv.width,cv.height);}else if(phase!=='effect')clearShot();});
document.addEventListener('pointerdown',()=>window.furyAPI.cancel());document.addEventListener('keydown',e=>{if(e.key==='Escape')window.furyAPI.cancel();});window.addEventListener('unload',clearShot);
