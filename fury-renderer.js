const cv=document.querySelector('canvas'),cx=cv.getContext('2d'),hint=document.querySelector('#hint');let shot=null,start=0,phase='effect',portrait=null,petAt=null;
function load(url){return new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url;});}
function clearShot(){if(shot){const old=shot;shot=null;old.onload=null;old.onerror=null;old.src='';}cx.clearRect(0,0,cv.width,cv.height);}
window.furyAPI.onInit(d=>{cv.width=innerWidth;cv.height=innerHeight;petAt=d.petAt;shot=new Image();shot.onload=()=>{start=performance.now();requestAnimationFrame(draw);};shot.onerror=()=>{clearShot();window.furyAPI.cancel();};shot.src=d.image;d.image='';});
function draw(t){if(phase!=='effect'||!shot)return;const u=Math.min(1,(t-start)/4500),w=cv.width,h=cv.height;cx.clearRect(0,0,w,h);cx.drawImage(shot,0,0,w,h);const k=Math.floor(u*24);let r=(()=>{let s=k*9841+17;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
 for(let j=0;j<3+u*15;j++){let y=r()*h,bh=4+r()*(4+u*23),dx=(r()-.5)*(10+u*130);cx.drawImage(shot,0,y*shot.height/h,shot.width,bh*shot.height/h,dx,y,w,bh);cx.fillStyle=j%2?'#00bad51c':'#d836751c';cx.fillRect(dx,y,w,bh);}
 for(let j=0;j<5+u*18;j++){cx.fillStyle=j%3?'#5cb3c877':'#ca5b9477';cx.fillRect(r()*w,r()*h,6+r()*50,2);}
 if(u>.78){cx.fillStyle='#080c12';for(let j=0;j<(u-.78)*65;j++)cx.fillRect(0,j*h/14,w,h/30);}
 if(portrait&&petAt){cx.drawImage(portrait,petAt.x,petAt.y,petAt.w,petAt.h);}
 requestAnimationFrame(draw);
}
window.furyAPI.onState(s=>{phase=s.phase;if(phase==='blackout'){clearShot();portrait=null;hint.style.display='none';cx.fillStyle='#000';cx.fillRect(0,0,cv.width,cv.height);}else if(phase!=='effect')clearShot();});
document.addEventListener('pointerdown',()=>window.furyAPI.cancel());document.addEventListener('keydown',e=>{if(e.key==='Escape')window.furyAPI.cancel();});window.addEventListener('unload',clearShot);
