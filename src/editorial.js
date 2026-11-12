// WatAir editorial studio: first-party articles, AI drafts and Buffer delivery.
// Keys are encrypted at rest; publishing is disabled until explicitly enabled in CMS.
const crypto = require('crypto');
const { db } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS news_articles (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT "Technology", excerpt TEXT NOT NULL DEFAULT "", body_html TEXT NOT NULL DEFAULT "", image_url TEXT NOT NULL DEFAULT "", seo_title TEXT NOT NULL DEFAULT "", seo_description TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "draft", published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE INDEX IF NOT EXISTS news_published ON news_articles(status,published_at DESC)');
db.exec('CREATE TABLE IF NOT EXISTS social_channels (id TEXT PRIMARY KEY, name TEXT NOT NULL, service TEXT NOT NULL, organization_id TEXT NOT NULL DEFAULT "", enabled INTEGER NOT NULL DEFAULT 0, connected INTEGER NOT NULL DEFAULT 1, synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
db.exec('CREATE TABLE IF NOT EXISTS social_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT NOT NULL DEFAULT "technology", headline TEXT NOT NULL DEFAULT "", caption TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT "", link_path TEXT NOT NULL DEFAULT "", article_id INTEGER, product_id INTEGER, status TEXT NOT NULL DEFAULT "draft", due_at TEXT, source TEXT NOT NULL DEFAULT "manual", created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(article_id) REFERENCES news_articles(id) ON DELETE SET NULL, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL)');
db.exec('CREATE INDEX IF NOT EXISTS social_posts_due ON social_posts(status,due_at)');
db.exec('CREATE TABLE IF NOT EXISTS social_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, channel_id TEXT NOT NULL, channel_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT "pending", buffer_post_id TEXT NOT NULL DEFAULT "", error TEXT NOT NULL DEFAULT "", attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(post_id,channel_id), FOREIGN KEY(post_id) REFERENCES social_posts(id) ON DELETE CASCADE)');
db.exec('CREATE TABLE IF NOT EXISTS social_daily_runs (day TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT "working", error TEXT NOT NULL DEFAULT "", post_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const setting = (key, fallback = '') => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
const putSetting = (key, value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
const defaults = {social_auto_enabled:'0',social_auto_time:'09:30',social_auto_style:'balanced',social_ai_model:'gpt-5.4-mini'};
for (const [k,v] of Object.entries(defaults)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k,v);

function keyMaterial() {
  const secret = String(process.env.SESSION_SECRET || '');
  if (secret.length < 32 && process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is required for editorial key storage');
  return crypto.scryptSync(secret || 'development-editorial-secret', 'watair-social-v1', 32);
}
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const payload = Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),payload.toString('base64')].join('.');
}
function decrypt(value) {
  if (!value) return '';
  const [version,iv,tag,ciphertext] = String(value).split('.');
  if (version !== 'v1') throw new Error('Unsupported encrypted credential format');
  const d = crypto.createDecipheriv('aes-256-gcm',keyMaterial(),Buffer.from(iv,'base64'));
  d.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(ciphertext,'base64')),d.final()]).toString('utf8');
}
function setCredential(name, value) {
  if (!['buffer_api_key','openai_api_key'].includes(name)) throw new Error('Invalid credential');
  db.prepare('INSERT INTO app_secrets(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').run('editorial_'+name,encrypt(value));
}
function getCredential(name) {
  const stored=db.prepare('SELECT value FROM app_secrets WHERE key=?').get('editorial_'+name)?.value;
  return stored? decrypt(stored) : String(process.env[name==='buffer_api_key'?'BUFFER_API_KEY':'OPENAI_API_KEY']||'').trim();
}
function credentials() {
  return {buffer:!!getCredential('buffer_api_key'),openai:!!getCredential('openai_api_key')};
}
function cleanLocalPath(value) {
  let s=String(value||'').trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const u=new URL(s), host=new URL(process.env.BASE_URL||'https://watairuk.co.uk');
      if (u.hostname.replace(/^www\./,'')!==host.hostname.replace(/^www\./,'')) return '';
      s=u.pathname;
    } catch { return ''; }
  }
  if (!s.startsWith('/')||s.startsWith('//')||/[<>"'\r\n]/.test(s)) return '';
  return s.slice(0,600);
}
function absolute(path) { return new URL(path, (process.env.BASE_URL||'https://watairuk.co.uk').replace(/\/?$/,'/')).href; }
async function jsonRequest(url, token, data, timeout=18000) {
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(timeout)});
  const body=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error((body.error?.message||body.message||'Provider request failed')+' (HTTP '+response.status+')');
  return body;
}
async function bufferQuery(query,variables={}) {
  const token=getCredential('buffer_api_key');
  if (!token) throw new Error('Set the Buffer API key in Editorial Studio first.');
  const data=await jsonRequest('https://api.buffer.com',token,{query,variables},20000);
  if (data.errors?.length) throw new Error(data.errors.map(x=>x.message).join('; ').slice(0,500));
  return data.data||{};
}
async function syncChannels() {
  const result=await bufferQuery('query { account { organizations { id name } } }');
  const orgs=result.account?.organizations||[];
  let all=[];
  for (const org of orgs) {
    const channels=await bufferQuery('query Channels($org: OrganizationId!) { channels(input:{ organizationId:$org }) { id name service } }',{org:org.id});
    all.push(...(channels.channels||[]).map(c=>({...c,organization_id:org.id})));
  }
  const tx=db.transaction(()=>{
    db.prepare('UPDATE social_channels SET connected=0').run();
    for (const c of all) {
      db.prepare('INSERT INTO social_channels(id,name,service,organization_id,connected) VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,service=excluded.service,organization_id=excluded.organization_id,connected=1,synced_at=CURRENT_TIMESTAMP').run(c.id,c.name,c.service,c.organization_id);
    }
  });tx();
  return all.length;
}
function allChannels() { return db.prepare('SELECT * FROM social_channels ORDER BY service,name').all(); }
function enabledChannels() { return db.prepare('SELECT * FROM social_channels WHERE enabled=1 AND connected=1 ORDER BY service,name').all(); }
function saveChannels(ids) {
  const list=new Set(ids.map(String));
  const tx=db.transaction(()=>{db.prepare('UPDATE social_channels SET enabled=0').run();for(const id of list)db.prepare('UPDATE social_channels SET enabled=1 WHERE id=? AND connected=1').run(id)});
  tx();
}
function topics(){ return ['did-you-know','technology','product','applications','water-quality','resilience','industry','environment']; }
function articleList(limit=100, publishedOnly=false) {
  const sql='SELECT * FROM news_articles '+(publishedOnly?'WHERE status="published" AND published_at <= CURRENT_TIMESTAMP ':'')+'ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT ?';
  return db.prepare(sql).all(limit);
}
function productList() { return db.prepare('SELECT id,name,slug,summary,image_url,capacity_lpd,specs_json FROM products WHERE published=1 ORDER BY capacity_lpd,id').all(); }
function targetFor(topic,number) {
  const articles=articleList(30,true);
  const products=productList();
  if (topic==='product'&&products.length) {
    const product=products[number%products.length];
    return {title:product.name, facts:product.summary+'; rated daily output '+product.capacity_lpd+' litres (site conditions affect actual output); model specifications '+product.specs_json, link_path:'/products/'+product.slug, image_url:cleanLocalPath(product.image_url), product_id:product.id};
  }
  if ((topic==='did-you-know'||topic==='applications'||topic==='industry'||topic==='environment')&&articles.length) {
    const a=articles[number%articles.length];
    return {title:a.title,facts:a.excerpt,link_path:'/news/'+a.slug,image_url:cleanLocalPath(a.image_url),article_id:a.id};
  }
  const paths={'did-you-know':'/how-it-works',technology:'/how-it-works',applications:'/products',resilience:'/products',environment:'/environment/plastic-bottles','water-quality':'/water-quality-maintenance',industry:'/products/commercial-industrial'};
  const facts={
    'did-you-know':'Atmospheric water generators extract moisture from ambient air. Output varies with humidity and temperature.',
    technology:'Air intake, condensation, filtration/treatment and storage are stages in the process.',
    applications:'Equipment ranges from compact home/office units to commercial and industrial systems.',
    resilience:'On-site atmospheric water generation can form part of a wider water supply resilience plan, subject to site conditions.',
    environment:'Water made at the point of use can offer different storage and transport choices; full sustainability depends on energy and operating conditions.',
    'water-quality':'Safe drinking water requires model-specific filtration, sterilisation, maintenance and suitable water hygiene controls.',
    industry:'WatAir lists units with rated outputs up to 10,000 litres a day; real performance depends on operating conditions.'
  };
  return {title:topic.replace(/-/g,' '),facts:facts[topic]||facts.technology,link_path:paths[topic]||'/how-it-works',image_url:'/uploads/imported/legacy/images/home/products.jpg'};
}
function parseModelJson(body) {
  const raw=(body.output||[]).flatMap(o=>o.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n')||body.output_text||'';
  const trimmed=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  return JSON.parse(trimmed);
}
async function aiGenerate(kind,input) {
  const token=getCredential('openai_api_key');
  if (!token) throw new Error('Set the OpenAI API key in Editorial Studio first.');
  const model=setting('social_ai_model','gpt-5.4-mini');
  if (!/^gpt-5\.4-mini(?:-2026-03-17)?$/.test(model)) throw new Error('Only GPT-5.4 mini is approved for automatic content.');
  const system='You are WatAir UK editorial assistant. Write excellent British English for a company supplying atmospheric water generation solutions. Accurate, grounded, useful; engaging hooks and understated credibility, not generic advertising. Never invent performance, pricing, certifications, installations, client results or environmental savings. Distinguish rated capacities from actual output (humidity/temperature matters). Do not claim water is automatically drinkable without appropriate treatment and maintenance. No overly repetitive marketing copy. Output ONE valid JSON object without markdown.';
  const response=await jsonRequest('https://api.openai.com/v1/responses',token,{
    model,input:[{role:'system',content:system},{role:'user',content:JSON.stringify({kind,...input})}],
    max_output_tokens:kind==='article'?1500:450,store:false
  },35000);
  return parseModelJson(response);
}
async function makeCaption(topic,target,recent=[]) {
  const data=await aiGenerate('social_post',{
    task:'Produce JSON with headline (max 90 chars) and caption (80 to 140 words, 1-3 short paragraphs, useful hook, UK spelling, no markdown headings). Do not include a web link; the site URL will be attached verbatim later. 0-3 relevant hashtags. Avoid phrases found in recent samples.',
    content_type:topic,facts_verified:target.facts,target_page_title:target.title,
    url_to_link:absolute(target.link_path),recent_examples:recent.slice(0,8)
  });
  let caption=String(data.caption||'').trim().slice(0,1800);
  if (caption.length<60) throw new Error('AI returned insufficient content.');
  return {headline:String(data.headline||'WatAir insight').slice(0,90),caption};
}
async function makeArticle(topic,facts) {
  const data=await aiGenerate('article',{
    task:'JSON fields title, excerpt, body_html, seo_title, seo_description. Around 400-650 words. body_html only safe p/h2/h3/ul/li/strong tags. Educational, search-focused, verifiable from supplied information, no fictional data, assertions, case studies or links.',
    topic,verified_facts:facts||'Air moisture is condensed into water, then treated; daily yield depends on temperature and humidity. WatAir markets systems ranging from 20–10,000 rated litres/day. Water hygiene and model-specific maintenance matter.'
  });
  return data;
}
function createPost(post, channelIds) {
  const ids=[...new Set(channelIds.map(String))];
  const valid=new Set(allChannels().filter(c=>c.connected).map(c=>c.id));
  if (!ids.length || ids.some(id=>!valid.has(id))) throw new Error('Select at least one connected channel.');
  const tx=db.transaction(()=>{
    const r=db.prepare('INSERT INTO social_posts(topic,headline,caption,image_url,link_path,article_id,product_id,source,status,due_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
      post.topic||'technology',String(post.headline||'').slice(0,120),String(post.caption||'').slice(0,2500),
      cleanLocalPath(post.image_url),cleanLocalPath(post.link_path),post.article_id||null,post.product_id||null,
      post.source||'manual',post.status||'draft',post.due_at||null
    );
    const channel=db.prepare('SELECT name FROM social_channels WHERE id=?');
    for(const id of ids)db.prepare('INSERT INTO social_deliveries(post_id,channel_id,channel_name) VALUES(?,?,?)').run(r.lastInsertRowid,id,channel.get(id).name);
    return Number(r.lastInsertRowid);
  });return tx();
}
function getPost(id) {return db.prepare('SELECT * FROM social_posts WHERE id=?').get(id);}
function deliveries(postId) {return db.prepare('SELECT d.*,c.service,c.connected FROM social_deliveries d LEFT JOIN social_channels c ON c.id=d.channel_id WHERE d.post_id=? ORDER BY d.id').all(postId);}
function allPosts(limit=100) {return db.prepare('SELECT * FROM social_posts ORDER BY id DESC LIMIT ?').all(limit);}
async function dispatchPost(postId) {
  const post=getPost(postId);
  if(!post||!['scheduled','ready','partial','failed'].includes(post.status)) throw new Error('Post is not ready to send.');
  const targets=deliveries(postId).filter(d=>d.status==='pending'||d.status==='error');
  if(!targets.length)throw new Error('No pending deliveries; review remote posts before retrying.');
  const link=post.link_path?absolute(post.link_path):'';
  for(const d of targets) {
    if(!d.connected) {db.prepare('UPDATE social_deliveries SET status="error",error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run('Channel is no longer connected',d.id);continue;}
    // Persist a non-retryable intermediate state before the network call. If the
    // response is lost, an operator must check Buffer rather than duplicate it.
    db.prepare('UPDATE social_deliveries SET status="submitting",attempts=attempts+1,error="",updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ("pending","error")').run(d.id);
    const caption=post.caption.trim()+(link?'\n\n'+link:'');
    const query='mutation CreatePost($input: CreatePostInput!) { createPost(input:$input) { ... on PostActionSuccess { post { id status dueAt } } ... on MutationError { message } } }';
    const input={text:caption,channelId:d.channel_id,schedulingType:'automatic',mode:'shareNow',aiAssisted:post.source==='ai'||post.source==='automatic'};
    if(post.image_url)input.assets=[{image:{url:absolute(post.image_url)}}];
    if(['instagram','tiktok','pinterest'].includes(String(d.service||'').toLowerCase())&&!post.image_url) {
      db.prepare('UPDATE social_deliveries SET status="error",error=? WHERE id=?').run('This channel requires an image',d.id);continue;
    }
    try {
      const response=await bufferQuery(query,{input});
      const result=response.createPost;
      if(!result?.post?.id) {
        db.prepare('UPDATE social_deliveries SET status="error",error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(result?.message||'Buffer did not accept the post').slice(0,500),d.id);
      } else {
        db.prepare('UPDATE social_deliveries SET status="submitted",buffer_post_id=?,error="",updated_at=CURRENT_TIMESTAMP WHERE id=?').run(result.post.id,d.id);
      }
    } catch(e) {
      // Timeout, network failure or ambiguous GraphQL response: no blind retry.
      db.prepare('UPDATE social_deliveries SET status="needs_review",error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(e.message).slice(0,500),d.id);
    }
  }
  const status=deliveries(postId);
  const completed=status.every(d=>d.status==='submitted');
  const some=status.some(d=>d.status==='submitted');
  db.prepare('UPDATE social_posts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(completed?'submitted':some?'partial':'failed',postId);
  return status;
}
function londonNow() {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  return {day:[parts.year,parts.month,parts.day].join('-'),time:parts.hour+':'+parts.minute};
}
let workerBusy=false;
async function workerTick() {
  if(workerBusy)return;
  workerBusy=true;
  try {
    // Manual scheduled content: each post is handled once; sent targets cannot be resent.
    const due=db.prepare('SELECT id FROM social_posts WHERE status="scheduled" AND due_at<=? ORDER BY due_at LIMIT 5').all(new Date().toISOString());
    for(const item of due)await dispatchPost(item.id);
    const now=londonNow();
    if(setting('social_auto_enabled')!=='1'||now.time<setting('social_auto_time','09:30'))return;
    if(!getCredential('buffer_api_key')||!getCredential('openai_api_key'))return;
    const channels=enabledChannels();
    if(!channels.length)return;
    const claim=db.prepare('INSERT OR IGNORE INTO social_daily_runs(day) VALUES(?)').run(now.day);
    if(!claim.changes)return;
    try {
      const recent=allPosts(12);
      const pattern=topics();
      let index=Math.floor(Date.parse(now.day+'T00:00:00Z')/86400000);
      let topic=pattern[index%pattern.length];
      if(recent[0]?.topic===topic)topic=pattern[(index+1)%pattern.length];
      const target=targetFor(topic,index);
      const caption=await makeCaption(topic,target,recent.map(x=>x.caption));
      const id=createPost({...caption,topic,...target,source:'automatic',status:'ready'},channels.map(c=>c.id));
      db.prepare('UPDATE social_daily_runs SET status="created",post_id=? WHERE day=?').run(id,now.day);
      await dispatchPost(id);
      db.prepare('UPDATE social_daily_runs SET status="sent_to_buffer" WHERE day=?').run(now.day);
    }catch(e) {
      db.prepare('UPDATE social_daily_runs SET status="error",error=? WHERE day=?').run(String(e.message).slice(0,500),now.day);
      console.error('WatAir daily social automation:',e.message);
    }
  } catch(e) {console.error('WatAir editorial worker:',e.message);}
  finally {workerBusy=false;}
}
function startWorker() {
  // Startup catches a missed scheduled slot after a process restart.
  setTimeout(()=>workerTick(),15000).unref();
  setInterval(()=>workerTick(),60000).unref();
}
module.exports={db,setting,putSetting,credentials,setCredential,getCredential,cleanLocalPath,absolute,syncChannels,allChannels,enabledChannels,saveChannels,topics,articleList,productList,targetFor,makeCaption,makeArticle,createPost,getPost,deliveries,allPosts,dispatchPost,londonNow,startWorker};
