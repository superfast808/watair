// First-party, durable, Buffer-compatible image preparation.
// Buffer cannot upload local files: it downloads the public image URL itself.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const { publicSiteOrigin } = require('./site-url');

const PUBLIC_ROOT=path.resolve(__dirname,'..','public');
const SOCIAL_ROOT=path.join(PUBLIC_ROOT,'uploads','social');
const MAX_SOURCE_SIZE=25*1024*1024;
const MAX_RESULT_SIZE=8*1024*1024;
const ACCEPTED_SOURCE=/\.(?:jpe?g|png|webp|gif|avif|heif|heic|svg)$/i;
const baseUrl=publicSiteOrigin;
const verifyEnabled=()=>!/^(0|false|off|no)$/i.test(String(process.env.SOCIAL_MEDIA_VERIFY_PUBLIC||'1').trim());

function pathOfImage(input){
  const value=String(input||'').trim();
  if(!value)throw new Error('Please choose a featured image or product photo before publishing.');
  if(!value.startsWith('/')||value.startsWith('//')||/[\\?#\x00-\x1f]/.test(value)){
    throw new Error('Choose a local image from the WatAir media library, not an external or temporary link.');
  }
  if(!/^\/(?:images|uploads)\//.test(value)||!ACCEPTED_SOURCE.test(value)){
    throw new Error('Only image files from /images or /uploads are supported for social publishing.');
  }
  const source=path.resolve(PUBLIC_ROOT,'.'+decodeURIComponent(value));
  if(!source.startsWith(PUBLIC_ROOT+path.sep)){
    throw new Error('Invalid image path.');
  }
  return {source,originalPath:value};
}
async function makeSocialImage(input){
  const {source,originalPath}=pathOfImage(input);
  let real,stat;
  try{
    real=await fsp.realpath(source);
    if(!real.startsWith(PUBLIC_ROOT+path.sep))throw new Error('Image is outside public storage');
    stat=await fsp.stat(real);
  }catch(e){
    throw new Error('The selected image does not exist in the deployed public media directory: '+originalPath+'. Check the Docker /public/uploads volume and import.');
  }
  if(!stat.isFile()||stat.size<100||stat.size>MAX_SOURCE_SIZE){
    throw new Error('The selected image is empty or too large (maximum 25 MB): '+originalPath);
  }
  let data;
  try{
    // Extract original width, height and inspect validity before generating.
    data=await sharp(real,{limitInputPixels:60000000,failOn:'error'}).metadata();
  }catch(e){throw new Error('The source file is not a readable image: '+originalPath);}
  if(!data.width||!data.height)throw new Error('Image has no usable dimensions: '+originalPath);
  const digest=crypto.createHash('sha256').update(real+'|'+stat.size+'|'+stat.mtimeMs+'|social-1200sq-v2').digest('hex').slice(0,32);
  const filename=digest+'.jpg';
  const destination=path.join(SOCIAL_ROOT,filename);
  await fsp.mkdir(SOCIAL_ROOT,{recursive:true});
  if(!fs.existsSync(destination)){
    const temporary=path.join(SOCIAL_ROOT,'.'+digest+'-'+crypto.randomBytes(6).toString('hex')+'.jpg');
    try{
      await sharp(real,{limitInputPixels:60000000,failOn:'error'})
        .rotate().resize(1200,1200,{fit:'contain',background:{r:238,g:247,b:249,alpha:1},withoutEnlargement:false})
        .flatten({background:'#eef7f9'}).toColourspace('srgb')
        .jpeg({quality:84,progressive:false,mozjpeg:true}).toFile(temporary);
      const output=await fsp.stat(temporary);
      if(output.size>MAX_RESULT_SIZE)throw new Error('Converted social image exceeds 8 MB.');
      await fsp.rename(temporary,destination);
    }finally{
      await fsp.rm(temporary,{force:true}).catch(()=>{});
    }
  }
  const resultStat=await fsp.stat(destination);
  if(resultStat.size<100||resultStat.size>MAX_RESULT_SIZE)throw new Error('Generated social image has invalid size.');
  const imageUrl=baseUrl()+'/uploads/social/'+filename;
  return {url:imageUrl,path:'/uploads/social/'+filename,bytes:resultStat.size,width:1200,height:1200,source:originalPath};
}
async function checkPublicUrl(media){
  if(!verifyEnabled())return {ok:true,detail:'Public reachability check disabled in environment; validated local JPEG only.'};
  let res;
  try{
    // GET, not HEAD: some reverse proxies and CDNs behave differently with HEAD.
    // Buffer also uses a normal remote fetch. No user-controlled URL is fetched.
    res=await fetch(media.url,{
      method:'GET',redirect:'error',
      headers:{Accept:'image/jpeg','User-Agent':'WatAir-MediaPreflight/1.0'},
      signal:AbortSignal.timeout(11000)
    });
  }catch(e){
    const reason=String(e?.cause?.code||e?.code||e?.message||'request failed').slice(0,100);
    throw new Error('The public image URL could not be reached from the server ('+reason+'): '+media.url+'. Check DNS, TLS, proxy and CDN/WAF settings.');
  }
  if(res.status!==200){
    await res.body?.cancel().catch(()=>{});
    throw new Error('Public image URL returned HTTP '+res.status+' instead of 200: '+media.url+'. Allow unauthenticated access; check Cloudflare bot protections and Plesk rules.');
  }
  const type=String(res.headers.get('content-type')||'').toLowerCase();
  if(!type.startsWith('image/jpeg')){
    await res.body?.cancel().catch(()=>{});
    throw new Error('Public image URL returned '+(type||'no Content-Type')+' rather than image/jpeg: '+media.url+'. A login page or bot challenge may be intercepting it.');
  }
  const reader=res.body?.getReader();
  let first=Buffer.alloc(0);
  if(reader){
    try{
      while(first.length<3){
        const next=await reader.read();
        if(next.done)break;
        first=Buffer.concat([first,Buffer.from(next.value)]);
        if(first.length>4096)break;
      }
    }finally{await reader.cancel().catch(()=>{});}
  }else{
    const bytes=Buffer.from(await res.arrayBuffer());
    first=bytes.subarray(0,3);
  }
  if(first.length<3||first[0]!==0xff||first[1]!==0xd8||first[2]!==0xff)
    throw new Error('Public image URL returned a response that is not valid JPEG data: '+media.url);
  return {ok:true,detail:'Public HTTPS GET returned 200, image/jpeg and valid JPEG bytes.'};
}
async function prepareForBuffer(input,{verify=true}={}){
  const media=await makeSocialImage(input);
  if(verify)media.preflight=await checkPublicUrl(media);
  return media;
}
module.exports={makeSocialImage,checkPublicUrl,prepareForBuffer,pathOfImage};
