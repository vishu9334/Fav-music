/** Native gesture callbacks update refs only; scrolling never schedules a playback command. */
export class ScrollInteraction {
  private dragging=false;
  private momentum=false;
  private until=0;
  public constructor(private readonly now:()=>number=Date.now){}
  public beginDrag=():void=>{this.dragging=true;};
  public endDrag=():void=>{this.dragging=false;this.until=this.now()+180;};
  public beginMomentum=():void=>{this.momentum=true;};
  public endMomentum=():void=>{this.dragging=false;this.momentum=false;this.until=this.now()+180;};
  public allowPress=():boolean=>!this.dragging&&!this.momentum&&this.now()>=this.until;
}
/** Position metadata only; bounded independently of React state and music/account data. */
export class ListPositions {
  private readonly offsets=new Map<string,number>();
  public get(key:string):number{return this.offsets.get(key)??0;}
  public set(key:string,offset:number):void{
    if(!Number.isFinite(offset)||offset<0)return;
    this.offsets.delete(key);this.offsets.set(key,offset);
    while(this.offsets.size>32)this.offsets.delete(this.offsets.keys().next().value!);
  }
}
export const listPositions=new ListPositions();
