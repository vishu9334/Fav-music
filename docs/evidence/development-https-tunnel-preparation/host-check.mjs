import fs from 'node:fs/promises';
const origin=process.argv[2],probeId=process.argv[3];
if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin??'')||!/^[-a-z0-9]{1,80}$/i.test(probeId??''))throw new Error('Expected generated HTTPS Quick Tunnel origin and probe ID');
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('TLS verification must remain enabled');
const query='query HostTunnelReadiness { health { status version } authCapabilities { service version authenticationEnabled cloudCollectionsEnabled } }';
const result={at:new Date().toISOString(),origin,probeId,credentialsSent:false,redirectsAllowed:false,checks:[]};
for(const [path,gql] of [['/health/live',null],['/health/ready',null],['/graphql',query]]) {
 try{
  const response=await fetch(origin+path,{method:gql?'POST':'GET',headers:{Accept:'application/json',...(gql?{'Content-Type':'application/json'}:{})},...(gql?{body:JSON.stringify({query:gql})}:{}),redirect:'error',signal:AbortSignal.timeout(12000)});
  const reader=response.body.getReader();let size=0,chunks=[];try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>65536)throw new Error('Response size limit');chunks.push(p.value);}}finally{await reader.cancel();}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));let pass=response.status===200;
  if(gql){const d=payload.data;pass=pass&&!payload.errors&&d?.health?.status==='ok'&&d.authCapabilities?.service==='aadat-music'&&d.authCapabilities.authenticationEnabled===false&&d.authCapabilities.cloudCollectionsEnabled===false;}
  else pass=pass&&(path==='/health/live'?payload.status==='alive':payload.ready===true);
  result.checks.push({path,httpStatus:response.status,payload,pass});
 }catch(e){result.checks.push({path,pass:false,error:{name:e.name,code:e.cause?.code??null,message:e.message.replace(/https?:\/\/\S+/g,'[URI]')}});}
}
result.pass=result.checks.every(x=>x.pass);await fs.writeFile('/tmp/aadat-https-tunnel-preparation/host-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
