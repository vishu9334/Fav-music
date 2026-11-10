import { describe, expect, it, vi } from 'vitest';
const share=vi.hoisted(()=>vi.fn(async()=>({action:'dismissedAction'})));
vi.mock('react-native',()=>({Share:{share}}));
import { NativeShareGateway } from '../share-link.service';
describe('Android native sharing boundary (mocked)',()=>{
  it('forwards the exact title and text including URL, and accepts dismissal without claiming recipient success',async()=>{
    const gateway=new NativeShareGateway(),message='Believer — Imagine Dragons\nhttps://www.jiosaavn.com/song/believer/Mg0zcxdSYXg';
    await expect(gateway.share('Believer — Imagine Dragons',message)).resolves.toBeUndefined();expect(share).toHaveBeenCalledWith({title:'Believer — Imagine Dragons',message});
    share.mockRejectedValueOnce(new Error('Native sheet unavailable'));await expect(gateway.share('Title',message)).rejects.toThrow('Native sheet unavailable');
  });
});
