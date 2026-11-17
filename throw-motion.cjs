// Bounded, damped throw simulation. Coordinates describe the pet window.
class ThrowMotion {
 constructor({x,y,vx=0,vy=0,area,w,h}){this.area=area;this.w=w;this.h=h;this.x=x;this.y=y;this.vx=Math.max(-1600,Math.min(1600,vx));this.vy=Math.max(-1400,Math.min(1400,vy));this.age=0;this.done=false;this.bounces=0;}
 step(dt){dt=Math.max(0,Math.min(.035,dt));this.age+=dt;const a=this.area,minX=a.x,maxX=Math.max(minX,a.x+a.width-this.w),minY=a.y,maxY=Math.max(minY,a.y+a.height-this.h);this.vy+=1800*dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
 if(this.x<minX||this.x>maxX){this.x=Math.max(minX,Math.min(maxX,this.x));this.vx*=-.52;}
 if(this.y<minY){this.y=minY;this.vy=Math.abs(this.vy)*.45;}
 if(this.y>=maxY){this.y=maxY;if(this.vy>100){this.bounces++;this.vy*=-.48;this.vx*=.67;}else{this.vy=0;this.vx*=.75;}if(Math.abs(this.vy)<65&&Math.abs(this.vx)<30)this.done=true;}
 if(this.age>5){this.done=true;this.y=maxY;}this.x=Math.max(minX,Math.min(maxX,this.x));this.y=Math.max(minY,Math.min(maxY,this.y));return {x:Math.round(this.x),y:Math.round(this.y),done:this.done,bounces:this.bounces};}
}
module.exports={ThrowMotion};
