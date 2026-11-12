import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename,unlink,access,readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {spawn} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const root=process.env.NORMATIVE_RAG_ROOT||'/tmp/scl-normative';
let state={status:'not_configured',coverage:null};
export const normativeState=()=>state;
const hash=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,s)=>createHmac('sha256',key).update(s).digest();
async function object(key){
 const endpoint=new URL(process.env.ATLAS_CORPUS_ENDPOINT),bucket=process.env.ATLAS_CORPUS_BUCKET,region=process.env.ATLAS_CORPUS_REGION,accessKey=process.env.ATLAS_CORPUS_ACCESS_KEY_ID,secret=process.env.ATLAS_CORPUS_SECRET_ACCESS_KEY;
 if(endpoint.protocol!=='https:')throw Error('endpoint');
 const pathStyle=process.env.ATLAS_CORPUS_URL_STYLE==='path';if(!pathStyle)endpoint.hostname=bucket+'.'+endpoint.hostname;
 endpoint.pathname=(pathStyle?'/'+bucket:'')+'/'+key.split('/').map(encodeURIComponent).join('/');
 const time=new Date().toISOString().replace(/[-:]|\.\d{3}/g,''),date=time.slice(0,8),scope=`${date}/${region}/s3/aws4_request`,bodyHash=hash(''),signed='host;x-amz-content-sha256;x-amz-date',canonical=`GET\n${endpoint.pathname}\n\nhost:${endpoint.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${time}\n\n${signed}\n${bodyHash}`,toSign=`AWS4-HMAC-SHA256\n${time}\n${scope}\n${hash(canonical)}`,signature=createHmac('sha256',hmac(hmac(hmac(hmac('AWS4'+secret,date),region),'s3'),'aws4_request')).update(toSign).digest('hex');
 const response=await fetch(endpoint,{headers:{'x-amz-content-sha256':bodyHash,'x-amz-date':time,authorization:`AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`},signal:AbortSignal.timeout(240000),redirect:'error'});if(!response.ok){await response.body?.cancel();throw Error('storage_status_'+response.status)}return response;
}
export async function restoreNormative(){
 if(!['ATLAS_CORPUS_ENDPOINT','ATLAS_CORPUS_BUCKET','ATLAS_CORPUS_REGION','ATLAS_CORPUS_ACCESS_KEY_ID','ATLAS_CORPUS_SECRET_ACCESS_KEY'].every(k=>process.env[k]))return;
 state={status:'loading',coverage:null};let temp;
 try{
  await mkdir(root,{recursive:true,mode:0o700});const manifest=await(await object('atlas-private-content/normative/latest.json')).json();
  if(!/^[a-f0-9]{64}$/.test(manifest.sha256)||manifest.bytes<1||manifest.bytes>2*1024**3||manifest.objectKey!=='atlas-private-content/normative/'+manifest.sha256+'.sqlite.gz')throw Error('manifest');
  const target=join(root,'normative.sqlite');temp=join(root,randomUUID()+'.sqlite');const obj=await object(manifest.objectKey);let count=0,unpacked=0;const digest=createHash('sha256');
  await pipeline(Readable.fromWeb(obj.body),new Transform({transform(part,encoding,done){count+=part.length;digest.update(part);done(count>manifest.bytes?Error('size'):null,part)}}),createGunzip(),new Transform({transform(part,encoding,done){unpacked+=part.length;done(unpacked>4*1024**3?Error('size'):null,part)}}),createWriteStream(temp,{flags:'wx',mode:0o600}));
  if(count!==manifest.bytes||digest.digest('hex')!==manifest.sha256)throw Error('integrity');await rename(temp,target);await writeFile(join(root,'coverage.json'),JSON.stringify(manifest.coverage),{mode:0o600});state={status:'ready',coverage:manifest.coverage};console.log('normative_corpus_ready',manifest.coverage?.indexedDocuments,manifest.coverage?.chunks);
 }catch(error){state={status:'unavailable',coverage:null};console.error('normative_corpus_unavailable',String(error.message).slice(0,70));if(temp)await unlink(temp).catch(()=>{})}
}
export async function searchNormative(question,history=[]){
 if(state.status!=='ready')return[];
 return new Promise(done=>{const child=spawn('python3',[resolve(here,'scripts/search-normative.py')],{cwd:here,env:{...process.env,NORMATIVE_RAG_ROOT:root},stdio:['pipe','pipe','pipe']});let data='',ended=false;const finish=x=>{if(ended)return;ended=true;clearTimeout(timer);child.kill();done(x)};const timer=setTimeout(()=>finish([]),14000);child.stdout.on('data',p=>{data+=p.toString();if(data.length>180000)finish([])});child.stderr.on('data',p=>console.error('normative_search_error',p.toString().slice(0,240)));child.on('error',()=>finish([]));child.on('close',()=>{try{const rows=JSON.parse(data);finish(Array.isArray(rows)?rows.slice(0,12).filter(p=>p.sourceKind==='normative'&&typeof p.text==='string'&&p.officialUrl?.startsWith('https://')).map(p=>({id:'norm-'+hash(p.documentId+'|'+p.chunkId).slice(0,20),doc:p.documentId,title:p.title,status:'Fuente normativa · verificar vigencia y aplicabilidad al caso',page:p.pageStart,locator:[p.section,p.pageStart?'Página '+p.pageStart:'',p.court].filter(Boolean).join(' · '),url:p.officialUrl+(p.officialUrl.includes('#')?'':p.pageStart?'#page='+p.pageStart:''),text:p.text,legalContext:p.legalContext})):[])}catch{finish([])}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({question,context:history.slice(-1).map(x=>x.question||'').join(' ')}));});
}
