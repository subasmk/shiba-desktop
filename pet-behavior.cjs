// Pure behavior policy, also loaded by the isolated renderer as a normal script.
(function(root){
 const actions=['wave','bow','ramen','sleep'];
 class PetBehavior {
  constructor(random=Math.random){this.random=random;this.lastAction='';this.nextAt=0;this.press=null;}
  quiet(now){this.nextAt=now+6500+this.random()*5500;}
  due(now,animation){if(animation!=='idle'||this.press||now<this.nextAt)return null;const candidates=actions.filter(x=>x!==this.lastAction);this.lastAction=candidates[Math.floor(this.random()*candidates.length)];this.quiet(now);return this.lastAction;}
  down(x,y,now){this.press={x,y,at:now,dragging:false};}
  move(x,y,now){const p=this.press;if(!p)return false;if(!p.dragging&&now-p.at>=80&&Math.hypot(x-p.x,y-p.y)>=12)p.dragging=true;return p.dragging;}
  up(cancel=false){const p=this.press;this.press=null;return p?.dragging?'drop':p&&!cancel?'tap':'none';}
 }
 if(typeof module==='object')module.exports={PetBehavior};else root.PetBehavior=PetBehavior;
})(globalThis);
