const express=require('express');
const sanitizeHtml=require('sanitize-html');
const {requireCsrf}=require('./auth');
const S=require('./editorial');
const publicRouter=express.Router(), adminRouter=express.Router();
const getArticles=()=>S.articleList(100,false);
const articleById=id=>S.db.prepare('SELECT * FROM news_articles WHERE id=?').get(id);
const newsSlug=s=>String(s||'').toLowerCase().trim().replace(/&/g,'-and-').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'article';
function uniqueSlug(raw,except=0) {
  const base=newsSlug(raw);let slug=base, n=2;
  while(S.db.prepare('SELECT id FROM news_articles WHERE slug=? AND id<>?').get(slug,except))slug=base+'-'+n++;
  return slug;
}
function cleanArticle(body) {
  return sanitizeHtml(String(body||''),{
    allowedTags:['p','h2','h3','h4','br','strong','em','b','i','ul','ol','li','blockquote','a'],
    allowedAttributes:{a:['href','title','target','rel']},
    allowedSchemes:['https','http','mailto'],
    transformTags:{a:(tag,attr)=>({tagName:'a',attribs:{...attr,rel:'noopener noreferrer'}})}
  }).slice(0,35000);
}
function articlePayload(body,old) {
  const title=String(body.title||'').trim().slice(0,180);
  if(title.length<8)throw new Error('Please enter a descriptive article title.');
  const image=S.cleanLocalPath(body.image_url||'');
  const category=String(body.category||'Technology').slice(0,60);
  const slug=uniqueSlug(body.slug||title,old?.id||0);
  return {title,slug,category,excerpt:String(body.excerpt||'').trim().slice(0,600),
    body_html:cleanArticle(body.body_html),image_url:image,
    seo_title:String(body.seo_title||title+' | WatAir UK').slice(0,170),
    seo_description:String(body.seo_description||body.excerpt||'').slice(0,230),
    status:body.status==='published'?'published':'draft'};
}
function safeRedirectError(res,base,e){return res.redirect(base+'?error='+encodeURIComponent(String(e.message||e).slice(0,220)));}
function viewData(req,extras={}) {
  return {...extras,reqQuery:req.query,meta:{title:extras.metaTitle||'Editorial Studio | WatAir CMS'}};
}
publicRouter.get('/news',(req,res)=>{
  const articles=S.articleList(100,true);
  res.render('news',{articles,meta:{title:'News, insights & atmospheric water generation | WatAir UK',description:'Explore technology explainers, water-from-air insights, practical guidance and updates from WatAir UK.',image:'/uploads/imported/legacy/images/home/products.jpg'}});
});
publicRouter.get('/news/feed.xml',(req,res)=>{
  const articles=S.articleList(40,true),base=S.absolute('/');
  const escape=s=>String(s||'').replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
  res.type('application/rss+xml').send('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>WatAir UK News</title><link>'+base+'</link><description>Atmospheric Water Generation insights</description>'+articles.map(a=>'<item><title>'+escape(a.title)+'</title><link>'+escape(S.absolute('/news/'+a.slug))+'</link><guid>'+escape(S.absolute('/news/'+a.slug))+'</guid><description>'+escape(a.excerpt)+'</description><pubDate>'+new Date(a.published_at+'Z').toUTCString()+'</pubDate></item>').join('')+'</channel></rss>');
});
publicRouter.get('/news/:slug',(req,res)=>{
  const article=S.db.prepare('SELECT * FROM news_articles WHERE slug=? AND status="published" AND published_at<=CURRENT_TIMESTAMP').get(req.params.slug);
  if(!article)return res.status(404).render('404',{meta:{title:'Article not found | WatAir UK',noindex:true}});
  const related=S.db.prepare('SELECT id,slug,title,image_url,excerpt FROM news_articles WHERE status="published" AND published_at<=CURRENT_TIMESTAMP AND id<>? ORDER BY published_at DESC LIMIT 3').all(article.id);
  res.render('news-article',{article,related,meta:{title:article.seo_title||article.title+' | WatAir UK',description:article.seo_description||article.excerpt,image:article.image_url||'/uploads/imported/legacy/images/home/products.jpg'}});
});

adminRouter.get('/editorial',(req,res)=>{
  res.render('admin/editorial',viewData(req,{
    metaTitle:'Editorial Studio | WatAir CMS',articles:getArticles(),posts:S.allPosts(60),channels:S.allChannels(),
    creds:S.credentials(),autoEnabled:S.setting('social_auto_enabled')==='1',autoTime:S.setting('social_auto_time','09:30'),
    autoStyle:S.setting('social_auto_style','balanced'),model:S.setting('social_ai_model','gpt-5.4-mini'),
    dailyRuns:S.db.prepare('SELECT * FROM social_daily_runs ORDER BY day DESC LIMIT 7').all(),
    totals:{
      published:S.db.prepare('SELECT COUNT(*) n FROM news_articles WHERE status="published"').get().n,
      drafts:S.db.prepare('SELECT COUNT(*) n FROM news_articles WHERE status="draft"').get().n,
      queued:S.db.prepare('SELECT COUNT(*) n FROM social_posts WHERE status IN ("scheduled","ready")').get().n,
      submitted:S.db.prepare('SELECT COUNT(*) n FROM social_deliveries WHERE status="submitted"').get().n
    }
  }));
});
adminRouter.post('/editorial/credentials',requireCsrf,(req,res)=>{
  try{
    if(String(req.body.buffer_api_key||'').trim())S.setCredential('buffer_api_key',String(req.body.buffer_api_key).trim());
    if(String(req.body.openai_api_key||'').trim())S.setCredential('openai_api_key',String(req.body.openai_api_key).trim());
    res.redirect('/admin/editorial?notice=Credentials+saved');
  }catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
adminRouter.post('/editorial/channels/sync',requireCsrf,async(req,res)=>{
  try{const count=await S.syncChannels();res.redirect('/admin/editorial?notice='+encodeURIComponent(count+' Buffer channels synced'))}
  catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
adminRouter.post('/editorial/channels',requireCsrf,(req,res)=>{
  try{S.saveChannels([].concat(req.body.channels||[]));res.redirect('/admin/editorial?notice=Default+channels+saved')}
  catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
adminRouter.post('/editorial/automation',requireCsrf,(req,res)=>{
  try{
    const time=String(req.body.social_auto_time||'09:30');
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Use a valid daily publishing time.');
    const enable=!!req.body.social_auto_enabled;
    if(enable&&(!S.credentials().buffer||!S.credentials().openai||!S.enabledChannels().length))throw new Error('Connect Buffer and OpenAI, then select at least one default channel before enabling automatic publishing.');
    S.putSetting('social_auto_time',time);
    S.putSetting('social_auto_style',String(req.body.social_auto_style||'balanced').slice(0,40));
    S.putSetting('social_ai_model','gpt-5.4-mini');
    S.putSetting('social_auto_enabled',enable?'1':'0');
    res.redirect('/admin/editorial?notice=Automation+preferences+saved');
  }catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
adminRouter.get('/editorial/articles/new',(req,res)=>{
  res.render('admin/editorial-article',viewData(req,{metaTitle:'New article | WatAir CMS',article:null,products:S.productList()}));
});
adminRouter.get('/editorial/articles/:id',(req,res)=>{
  const article=articleById(req.params.id);
  if(!article)return res.status(404).send('Article not found');
  res.render('admin/editorial-article',viewData(req,{metaTitle:'Edit article | WatAir CMS',article,products:S.productList()}));
});
adminRouter.post('/editorial/articles',requireCsrf,(req,res)=>{
  try{
    const p=articlePayload(req.body);
    const published=p.status==='published'?new Date().toISOString().replace('T',' ').slice(0,19):null;
    const r=S.db.prepare('INSERT INTO news_articles(slug,title,category,excerpt,body_html,image_url,seo_title,seo_description,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(p.slug,p.title,p.category,p.excerpt,p.body_html,p.image_url,p.seo_title,p.seo_description,p.status,published);
    res.redirect('/admin/editorial/articles/'+r.lastInsertRowid+'?notice=Saved');
  }catch(e){safeRedirectError(res,'/admin/editorial/articles/new',e)}
});
adminRouter.post('/editorial/articles/:id',requireCsrf,(req,res)=>{
  try{
    const old=articleById(req.params.id);if(!old)throw new Error('Article not found');
    const p=articlePayload(req.body,old);
    const published=p.status==='published'?(old.published_at||new Date().toISOString().replace('T',' ').slice(0,19)):null;
    S.db.prepare('UPDATE news_articles SET slug=?,title=?,category=?,excerpt=?,body_html=?,image_url=?,seo_title=?,seo_description=?,status=?,published_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.slug,p.title,p.category,p.excerpt,p.body_html,p.image_url,p.seo_title,p.seo_description,p.status,published,old.id);
    res.redirect('/admin/editorial/articles/'+old.id+'?notice=Saved');
  }catch(e){safeRedirectError(res,'/admin/editorial/articles/'+req.params.id,e)}
});
adminRouter.post('/editorial/ai/article',requireCsrf,async(req,res)=>{
  try{
    const topic=String(req.body.topic||'How atmospheric water generation works').trim().slice(0,220);
    if(topic.length<8)throw new Error('Provide an article subject.');
    const data=await S.makeArticle(topic,req.body.facts);
    const title=String(data.title||topic).slice(0,180),slug=uniqueSlug(title);
    const result=S.db.prepare('INSERT INTO news_articles(slug,title,category,excerpt,body_html,seo_title,seo_description,status) VALUES(?,?,?,?,?,?,?,"draft")').run(slug,title,'Technology',String(data.excerpt||'').slice(0,600),cleanArticle(data.body_html),String(data.seo_title||title).slice(0,170),String(data.seo_description||'').slice(0,230));
    res.redirect('/admin/editorial/articles/'+result.lastInsertRowid+'?notice=AI+article+draft+ready+for+review');
  }catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
function postForm(req,post=null) {
  const channels=S.allChannels();const chosen=post?S.deliveries(post.id).map(x=>x.channel_id):S.enabledChannels().map(x=>x.id);
  return viewData(req,{metaTitle:(post?'Edit':'New')+' social post | WatAir CMS',post,channels,chosen,products:S.productList(),articles:S.articleList(100,true),topics:S.topics(),deliveries:post?S.deliveries(post.id):[]});
}
adminRouter.get('/editorial/posts/new',(req,res)=>res.render('admin/editorial-post',postForm(req)));
adminRouter.get('/editorial/posts/:id',(req,res)=>{
  const post=S.getPost(req.params.id);
  if(!post)return res.status(404).send('Post not found');
  res.render('admin/editorial-post',postForm(req,post));
});
function postPayload(req) {
  const caption=String(req.body.caption||'').trim().slice(0,2450);
  if(caption.length<20)throw new Error('Enter at least 20 characters of useful post text.');
  const link=S.cleanLocalPath(req.body.link_path);
  const image=S.cleanLocalPath(req.body.image_url);
  const topic=S.topics().includes(req.body.topic)?req.body.topic:'technology';
  const ids=[...new Set([].concat(req.body.channels||[]).filter(Boolean).map(String))];
  if(!ids.length)throw new Error('Select at least one publishing channel.');
  const due=String(req.body.due_at||'').trim();
  let dueAt=null;
  if(due) {
    const parsed=Date.parse(due);
    if(!Number.isFinite(parsed)||parsed<Date.now()+60000)throw new Error('Schedule must be at least one minute in the future (UTC).');
    dueAt=new Date(parsed).toISOString();
  }
  return {topic,headline:String(req.body.headline||'').trim().slice(0,120),caption,image_url:image,link_path:link,
    article_id:Number(req.body.article_id)||null,product_id:Number(req.body.product_id)||null,due_at:dueAt,ids};
}
adminRouter.post('/editorial/posts',requireCsrf,(req,res)=>{
  try{
    const p=postPayload(req),action=req.body.action;
    const id=S.createPost({...p,status:action==='schedule'?'scheduled':'draft'},p.ids);
    res.redirect('/admin/editorial/posts/'+id+'?notice=Saved');
  }catch(e){safeRedirectError(res,'/admin/editorial/posts/new',e)}
});
adminRouter.post('/editorial/posts/:id',requireCsrf,(req,res)=>{
  try{
    const old=S.getPost(req.params.id);if(!old)throw new Error('Post not found');
    if(!['draft','scheduled'].includes(old.status))throw new Error('Queued/submitted posts cannot be edited. Create a new draft instead.');
    const p=postPayload(req),state=req.body.action==='schedule'?'scheduled':'draft';
    const valid=new Set(S.allChannels().filter(c=>c.connected).map(c=>c.id));
    if(p.ids.some(id=>!valid.has(id)))throw new Error('One of the selected channels is no longer connected.');
    S.db.transaction(()=>{
      S.db.prepare('UPDATE social_posts SET topic=?,headline=?,caption=?,image_url=?,link_path=?,article_id=?,product_id=?,due_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.topic,p.headline,p.caption,p.image_url,p.link_path,p.article_id,p.product_id,p.due_at,state,old.id);
      S.db.prepare('DELETE FROM social_deliveries WHERE post_id=?').run(old.id);
      for(const id of p.ids) {
        const c=S.db.prepare('SELECT name FROM social_channels WHERE id=?').get(id);
        S.db.prepare('INSERT INTO social_deliveries(post_id,channel_id,channel_name) VALUES(?,?,?)').run(old.id,id,c.name);
      }
    })();
    res.redirect('/admin/editorial/posts/'+old.id+'?notice=Saved');
  }catch(e){safeRedirectError(res,'/admin/editorial/posts/'+req.params.id,e)}
});
adminRouter.post('/editorial/posts/:id/send',requireCsrf,async(req,res)=>{
  try{
    const post=S.getPost(req.params.id);if(!post||!['draft','scheduled','ready'].includes(post.status))throw new Error('Only unsent posts can be dispatched');
    S.db.prepare('UPDATE social_posts SET status="ready",due_at=NULL WHERE id=?').run(post.id);
    await S.dispatchPost(post.id);
    res.redirect('/admin/editorial/posts/'+post.id+'?notice=Delivery+attempt+recorded');
  }catch(e){safeRedirectError(res,'/admin/editorial/posts/'+req.params.id,e)}
});
adminRouter.post('/editorial/posts/:id/retry',requireCsrf,async(req,res)=>{
  try{
    const post=S.getPost(req.params.id);if(!post)throw new Error('Post not found');
    if(!['failed','partial'].includes(post.status))throw new Error('No failed deliveries to retry');
    await S.dispatchPost(post.id);
    res.redirect('/admin/editorial/posts/'+post.id+'?notice=Retry+recorded');
  }catch(e){safeRedirectError(res,'/admin/editorial/posts/'+req.params.id,e)}
});
adminRouter.post('/editorial/ai/post',requireCsrf,async(req,res)=>{
  try{
    const topic=S.topics().includes(req.body.topic)?req.body.topic:'technology',products=S.productList(),articles=S.articleList(100,true);
    let target;
    if(req.body.article_id) {
      const a=articles.find(x=>x.id===Number(req.body.article_id));if(!a)throw new Error('Publish the selected article first.');
      target={title:a.title,facts:a.excerpt,link_path:'/news/'+a.slug,image_url:S.cleanLocalPath(a.image_url),article_id:a.id};
    }else if(req.body.product_id) {
      const p=products.find(x=>x.id===Number(req.body.product_id));if(!p)throw new Error('Product unavailable');
      target={title:p.name,facts:p.summary+'; specifications: '+p.specs_json,link_path:'/products/'+p.slug,image_url:S.cleanLocalPath(p.image_url),product_id:p.id};
    }else target=S.targetFor(topic,Math.floor(Date.now()/86400000));
    const caption=await S.makeCaption(topic,target,S.allPosts(8).map(x=>x.caption));
    const channels=S.enabledChannels();
    if(!channels.length)throw new Error('Select default connected channels first.');
    const id=S.createPost({...target,...caption,topic,source:'ai',status:'draft'},channels.map(c=>c.id));
    res.redirect('/admin/editorial/posts/'+id+'?notice=AI+draft+ready+for+review');
  }catch(e){safeRedirectError(res,'/admin/editorial',e)}
});
module.exports={publicRouter,adminRouter};
