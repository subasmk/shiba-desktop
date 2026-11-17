// Visual-only effect lifecycle. No operating-system power actions.
class FuryEffect {
 constructor({onState=()=>{},now=Date.now}={}){this.onState=onState;this.now=now;this.phase='idle';this.until=0;this.cooldown=0;}
 trigger(){if(this.phase!=='idle'||this.now()<this.cooldown)return false;this.phase='effect';this.emit();return true;}
 emit(){this.onState({phase:this.phase});}
 effectDone(){if(this.phase!=='effect')return;this.phase='blackout';this.until=this.now()+1000;this.emit();}
 tick(){if(this.phase==='blackout'&&this.now()>=this.until)this.cancel();}
 cancel(){this.phase='idle';this.until=0;this.cooldown=this.now()+60000;this.emit();}
}
module.exports={FuryEffect};
