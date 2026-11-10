/** Bounded metadata-only cache and synchronous single-flight guard for explicit page buttons. */
export class PageRequests<T> {
  private readonly cache=new Map<string,T>();
  private readonly pending=new Map<string,Promise<T>>();
  public run(key:string,fetchPage:()=>Promise<T>,force=false):Promise<T>{
    const pending=this.pending.get(key);if(pending)return pending;
    if(!force&&this.cache.has(key)){const value=this.cache.get(key)!;this.cache.delete(key);this.cache.set(key,value);return Promise.resolve(value);}
    const request=Promise.resolve().then(fetchPage).then(value=>{this.cache.set(key,value);while(this.cache.size>20)this.cache.delete(this.cache.keys().next().value!);return value;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,request);return request;
  }
}
export function appendStable<T extends {readonly id:string}>(before:readonly T[],incoming:readonly T[],limit=500):readonly T[]{
  const values=new Map(before.map(item=>[item.id,item]));
  for(const item of incoming){if(values.has(item.id)||values.size<limit)values.set(item.id,item);}
  const next=[...values.values()];return next.length===before.length&&next.every((item,i)=>item===before[i])?before:next;
}
