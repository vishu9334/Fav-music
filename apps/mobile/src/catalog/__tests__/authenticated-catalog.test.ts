import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({request:vi.fn(),restore:vi.fn(async()=>{}),owner:'10000000-0000-4000-8000-000000000001'}));
vi.mock('../../auth/adapters/native-auth.transport',()=>({nativeAuthTransport:state.request}));
vi.mock('../../auth/services/auth-config',()=>({AuthConfig:class{credentialEndpoint(){return 'https://api.example.test/graphql';}}}));
vi.mock('../../auth/auth.module',()=>({AuthModule:{getController:()=>({getSnapshot:()=>({status:'authenticated',user:{id:state.owner}}),restore:state.restore}),getSession:()=>({withAccessToken:async(_owner:string,request:(token:string)=>Promise<unknown>)=>{try{return await request('old-token');}catch(error){if((error as {code?:string}).code!=='UNAUTHORIZED')throw error;return request('rotated-token');}}})}}));
import {authenticatedCatalogTransport} from '../graphql-catalog.repository';
beforeEach(()=>{vi.clearAllMocks();});
describe('catalog requests use the existing authenticated session refresh boundary',()=>{
 it.each([401,200])('maps HTTP/GraphQL unauthorized inside the token callback, allowing its one retry (%s)',async status=>{
   state.request.mockResolvedValueOnce({ok:status===200,status,json:async()=>({errors:[{extensions:{code:'UNAUTHORIZED'}}]})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{catalogPage:{nodes:[],hasNextPage:false,endCursor:null}}})});
   const response=await authenticatedCatalogTransport('https://api.example.test/graphql',{body:'{}',headers:{}});
   expect(response.ok).toBe(true);expect(state.request).toHaveBeenCalledTimes(2);expect(state.request.mock.calls[1]![1].headers.Authorization).toBe('Bearer rotated-token');expect(state.restore).not.toHaveBeenCalled();
 });
 it('rejects another endpoint before any token or network callback',async()=>{await expect(authenticatedCatalogTransport('https://other.example.test/graphql',{body:'{}',headers:{}})).rejects.toThrow('not approved');expect(state.request).not.toHaveBeenCalled();});
});
