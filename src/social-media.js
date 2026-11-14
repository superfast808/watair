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
// ---------------------------------------------------------------------------
// Branded 1200×1200 social cards.
// Photos are cropped to fill the frame (no letterboxing); product cut-outs and
// white-background product shots sit on a clean white stage. When a headline is
// supplied it is set in Inter on a navy band with the WatAir logo, so the post
// reads at thumbnail size in a feed.
// ---------------------------------------------------------------------------
const SIZE=1200;
const CARD_VERSION='social-card-v4';
const FONT_DIR=path.resolve(__dirname,'..','assets','fonts');
const HEADLINE_FONT={font:'Inter Display ExtraBold',fontfile:path.join(FONT_DIR,'InterDisplay-ExtraBold.ttf')};
const LABEL_FONT={font:'Inter SemiBold',fontfile:path.join(FONT_DIR,'Inter-SemiBold.ttf')};
const LOGO=path.join(PUBLIC_ROOT,'images','logo-header.svg');
const NAVY='#062632', AQUA='#23c4dc';
const escapeMarkup=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function cleanOverlayText(value,max){
  let s=String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').replace(/#\w+/g,'').trim();
  // Emoji render as tofu in the bundled font; keep overlays typographic.
  s=s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,'').trim();
  if(s.length>max)s=s.slice(0,max).replace(/\s+\S*$/,'')+'…';
  return s;
}
// Render text to a transparent PNG, auto-fitting inside the box but never
// growing past maxPx (pango sizes are 12pt at the chosen dpi).
async function renderText(text,{width,height,maxPx,font,colour='#ffffff',align='left',letterSpacing=0}){
  const span=`<span foreground="${colour}"${letterSpacing?` letter_spacing="${letterSpacing}"`:''}>${escapeMarkup(text)}</span>`;
  const base={text:span,...font,width,align,rgba:true,wrap:'word'};
  const fitted=sharp({text:{...base,height}});
  let {data,info}=await fitted.png().toBuffer({resolveWithObject:true});
  const maxDpi=Math.round(maxPx*72/12);
  if(!info.textAutofitDpi||info.textAutofitDpi>maxDpi){
    ({data,info}=await sharp({text:{...base,dpi:maxDpi}}).png().toBuffer({resolveWithObject:true}));
  }
  return {input:data,width:info.width,height:info.height};
}
async function classify(file,meta){
  // Product cut-outs (real transparency) and studio shots on white get the
  // white stage; everything else is treated as a photograph and cropped to fill.
  if(meta.hasAlpha){
    const stats=await sharp(file).stats();
    const alpha=stats.channels[3];
    if(alpha&&alpha.min<200)return 'product';
  }
  const {data,info}=await sharp(file).flatten({background:'#ffffff'}).resize(24,24,{fit:'fill'}).raw().toBuffer({resolveWithObject:true});
  const px=(x,y)=>{const i=(y*info.width+x)*info.channels;return [data[i],data[i+1],data[i+2]];};
  const corners=[px(0,0),px(23,0),px(0,23),px(23,23),px(12,0),px(0,12),px(23,12)];
  const light=corners.filter(c=>c.every(v=>v>=228)).length;
  return light>=5?'product':'photo';
}
function gradientSvg(stops,{x1=0,y1=0,x2=0,y2=1,height=SIZE}={}){
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${height}"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o,c,a])=>`<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
}
async function footerLayers(top){
  const logo=await sharp(LOGO,{density:300}).resize({width:190}).png().toBuffer({resolveWithObject:true});
  const domain=await renderText('watairuk.co.uk',{width:600,height:40,maxPx:30,font:LABEL_FONT,colour:'#bdeef6'});
  return [
    {input:logo.data,left:SIZE-72-logo.info.width,top:Math.round(top+(44-logo.info.height)/2)},
    {input:domain.input,left:72,top:Math.round(top+(44-domain.height)/2)}
  ];
}
async function textBlock({headline,kicker},{top,bottom,maxPx}){
  // Lays out kicker + headline bottom-aligned within [top,bottom].
  const layers=[];
  const head=await renderText(headline,{width:SIZE-144,height:bottom-top-(kicker?64:0),maxPx,font:HEADLINE_FONT});
  const headTop=bottom-head.height;
  layers.push({input:head.input,left:72,top:headTop});
  if(kicker){
    const k=await renderText(kicker,{width:SIZE-144,height:34,maxPx:26,font:LABEL_FONT,colour:AQUA,letterSpacing:2400});
    const kTop=headTop-22-k.height;
    layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="6"><rect width="56" height="6" rx="3" fill="${AQUA}"/></svg>`),left:72,top:kTop-26});
    layers.push({input:k.input,left:72,top:kTop});
  }
  return layers;
}
async function composeCard(file,{headline,kicker}){
  const meta=await sharp(file).metadata();
  const kind=await classify(file,meta);
  const source=sharp(file,{limitInputPixels:60000000,failOn:'error'}).rotate();
  if(kind==='photo'){
    const photo=await source.resize(SIZE,SIZE,{fit:'cover',position:sharp.strategy.attention}).flatten({background:NAVY}).toBuffer();
    if(!headline)return sharp(photo).png().toBuffer();
    const layers=[
      {input:gradientSvg([[0,NAVY,0],[0.38,NAVY,0.15],[0.68,NAVY,0.82],[1,NAVY,0.97]])},
      ...(await textBlock({headline,kicker},{top:560,bottom:SIZE-150,maxPx:92})),
      ...(await footerLayers(SIZE-104))
    ];
    return sharp(photo).composite(layers).png().toBuffer();
  }
  // Product: white stage, product centred with breathing room.
  const stageHeight=headline?790:SIZE;
  const boxW=headline?980:1000, boxH=headline?660:1000;
  // Trim the padding baked into most product cut-outs so the unit fills the stage.
  let trimmed=await source.png().toBuffer();
  try{trimmed=await sharp(trimmed).trim({background:meta.hasAlpha?{r:0,g:0,b:0,alpha:0}:'#ffffff',threshold:18}).png().toBuffer();}catch{}
  const product=await sharp(trimmed).resize(boxW,boxH,{fit:'inside',withoutEnlargement:false}).png().toBuffer({resolveWithObject:true});
  const stage=sharp({create:{width:SIZE,height:SIZE,channels:4,background:'#ffffff'}});
  const layers=[
    {input:product.data,left:Math.round((SIZE-product.info.width)/2),top:Math.round((stageHeight-product.info.height)/2)+(headline?10:0)}
  ];
  if(headline){
    layers.push({input:gradientSvg([[0,'#0a3a4b',1],[1,NAVY,1]],{x1:0,y1:0,x2:1,y2:1,height:SIZE-stageHeight}),left:0,top:stageHeight});
    layers.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="6"><rect width="${SIZE}" height="6" fill="${AQUA}"/></svg>`),left:0,top:stageHeight});
    layers.push(...(await textBlock({headline,kicker:''},{top:stageHeight+56,bottom:SIZE-134,maxPx:68})));
    if(kicker){
      const k=await renderText(kicker,{width:SIZE-144,height:34,maxPx:26,font:LABEL_FONT,colour:AQUA,letterSpacing:2400});
      layers.push({input:k.input,left:72,top:stageHeight+44});
    }
    layers.push(...(await footerLayers(SIZE-100)));
  }
  return stage.composite(layers).flatten({background:'#ffffff'}).png().toBuffer();
}

async function makeSocialImage(input,card={}){
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
  const headline=cleanOverlayText(card.headline,90);
  const kicker=cleanOverlayText(card.kicker,32).toUpperCase();
  const digest=crypto.createHash('sha256').update(real+'|'+stat.size+'|'+stat.mtimeMs+'|'+CARD_VERSION+'|'+headline+'|'+kicker).digest('hex').slice(0,32);
  const filename=digest+'.jpg';
  const destination=path.join(SOCIAL_ROOT,filename);
  await fsp.mkdir(SOCIAL_ROOT,{recursive:true});
  if(!fs.existsSync(destination)){
    const temporary=path.join(SOCIAL_ROOT,'.'+digest+'-'+crypto.randomBytes(6).toString('hex')+'.jpg');
    try{
      let composed;
      try{composed=await composeCard(real,{headline,kicker});}
      catch(e){
        if(!headline)throw e;
        // Never let typography break publishing: send the cropped photo instead.
        console.error('WatAir social card text failed; sending image without headline:',e.message);
        composed=await composeCard(real,{headline:'',kicker:''});
      }
      await sharp(composed).toColourspace('srgb')
        .jpeg({quality:86,progressive:false,mozjpeg:true}).toFile(temporary);
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
async function prepareForBuffer(input,{verify=true,headline='',kicker=''}={}){
  const media=await makeSocialImage(input,{headline,kicker});
  if(verify)media.preflight=await checkPublicUrl(media);
  return media;
}
module.exports={makeSocialImage,checkPublicUrl,prepareForBuffer,pathOfImage};
