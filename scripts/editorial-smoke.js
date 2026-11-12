// Integration tests for WatAir's editorial publishing business rules.
// Buffer/OpenAI calls are mocked; no third-party content is sent.
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';
const {publicSiteOrigin}=require('../src/site-url');
const originalBaseUrl=process.env.BASE_URL;
const originalNoindex=process.env.SITE_NOINDEX;
process.env.BASE_URL='https://watair.co.uk';
process.env.NODE_ENV='production';
process.env.SITE_NOINDEX='0';
assert.equal(publicSiteOrigin(),'https://watairuk.co.uk','Live URLs must ignore an incorrect .env hostname');
process.env.SITE_NOINDEX='1';
assert.equal(publicSiteOrigin(),'https://watair.co.uk','Preview URLs retain explicitly configured domain');
process.env.NODE_ENV='test';
process.env.SITE_NOINDEX=originalNoindex;
process.env.BASE_URL=originalBaseUrl;
process.env.SESSION_SECRET='ci-editorial-tests-session-secret-123456789012345';
process.env.BASE_URL='https://watairuk.co.uk';
process.env.BUFFER_API_KEY='ci-buffer-test-key';
process.env.OPENAI_API_KEY='ci-openai-test-key';
process.env.SOCIAL_MEDIA_VERIFY_PUBLIC='0';
const S=require('../src/editorial');
(async()=>{
  const articles=S.articleList(100,true);
  assert.ok(articles.some(a=>a.slug==='what-is-atmospheric-water-generation'),'seeded introduction must be published');
  assert.ok(articles.some(a=>a.slug==='humidity-temperature-water-from-air-output'),'educational article must be published');
  const target=S.targetFor('did-you-know',0);
  assert.ok(target.link_path.startsWith('/news/'),'blog posts should link to live journal articles');

  const facebookId='aaaaaaaaaaaaaaaaaaaaaaaa';
  const instagramId='bbbbbbbbbbbbbbbbbbbbbbbb';
  const insert=S.db.prepare('INSERT INTO social_channels(id,name,service,organization_id,enabled,connected) VALUES(?,?,?,?,1,1)');
  insert.run(facebookId,'WatAir Facebook','facebook','org-ci');
  insert.run(instagramId,'WatAir Instagram','instagram','org-ci');
  assert.equal(S.enabledChannels().length,2);
  let fbSent=0,igSent=0, aiSent=0;
  global.fetch=async(url,request)=>{
    const payload=JSON.parse(request.body);
    if(String(url).includes('openai.com')) {
      aiSent++;
      assert.equal(payload.model,'gpt-5.4-mini');
      return {ok:true,status:200,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({headline:'Water from air',caption:'Did you know that ambient air contains water vapour? Actual daily water production depends on humidity and temperature, so a site assessment matters before selecting a model. Every system also requires the appropriate treatment and maintenance for the intended use. #AtmosphericWaterGeneration'})}]}]})};
    }
    assert.equal(String(url),'https://api.buffer.com');
    assert.ok(payload.query.includes('createPost'));
    const input=payload.variables.input;
    assert.equal(input.mode,'shareNow');
    assert.ok(input.text.includes('https://watairuk.co.uk/news/'));
    assert.match(input.assets[0].image.url,/^https:\/\/watairuk\.co\.uk\/uploads\/social\/[a-f0-9]{32}\.jpg$/);
    const sharp=require('sharp');
    const filePath=require('node:path').join(__dirname,'../public',new URL(input.assets[0].image.url).pathname);
    const data=await sharp(filePath).metadata();
    assert.equal(data.format,'jpeg');
    assert.equal(data.width,1200);
    assert.equal(data.height,1200);
    if(input.channelId===facebookId) {
      fbSent++;
      assert.equal(input.metadata.facebook.type,'post');
    } else if(input.channelId===instagramId) {
      igSent++;
      assert.equal(input.metadata.instagram.type,'post');
      assert.equal(input.metadata.instagram.shouldShareToFeed,true);
    } else throw Error('Unexpected destination');
    return {ok:true,status:200,json:async()=>({data:{createPost:{post:{id:'buffer-'+input.channelId,status:'sent',dueAt:null}}}})};
  };
  const ai=await S.makeCaption('did-you-know',target);
  assert.ok(ai.caption.length>60);
  assert.equal(aiSent,1);
  const id=S.createPost({topic:'did-you-know',headline:ai.headline,caption:ai.caption,image_url:'/images/pw-hr-20l.webp',link_path:'/news/what-is-atmospheric-water-generation',source:'ai',status:'ready'},[facebookId,instagramId]);
  assert.equal(S.deliveries(id).length,2);
  const result=await S.dispatchPost(id);
  assert.ok(result.every(x=>x.status==='submitted'));
  assert.equal(S.getPost(id).status,'submitted');
  assert.equal(fbSent,1);
  assert.equal(igSent,1);
  await assert.rejects(()=>S.dispatchPost(id),/not ready/);
  assert.equal(fbSent,1);
  assert.equal(igSent,1);
  const {prepareForBuffer,checkPublicUrl}=require('../src/social-media');
  const media=await prepareForBuffer('/images/pw-hr-20l.webp',{verify:false});
  assert.match(media.url,/^https:\/\/watairuk\.co\.uk\/uploads\/social\/[a-f0-9]{32}\.jpg$/);
  process.env.SOCIAL_MEDIA_VERIFY_PUBLIC='1';
  const fetchPrevious=global.fetch;
  global.fetch=async()=>({status:403,headers:{get:()=> 'text/html'},body:{cancel:async()=>{}}});
  await assert.rejects(()=>checkPublicUrl(media),/HTTP 403/);
  global.fetch=async()=>({status:200,headers:{get:()=> 'text\/html'},body:{cancel:async()=>{}}});
  await assert.rejects(()=>checkPublicUrl(media),/rather than image\/jpeg/);
  global.fetch=async()=>({status:200,headers:{get:()=> 'image\/jpeg'},body:{
    getReader:()=>({read:async()=>({done:false,value:new Uint8Array([0xff,0xd8,0xff,0x00])}),cancel:async()=>{}})
  }});
  const good=await checkPublicUrl(media);
  assert.equal(good.ok,true);
  global.fetch=fetchPrevious;
  process.env.SOCIAL_MEDIA_VERIFY_PUBLIC='0';
  await assert.rejects(()=>prepareForBuffer('/uploads/does-not-exist.jpg',{verify:false}),/does not exist/);
  const failed=S.createPost({
    topic:'technology',caption:ai.caption,image_url:'/uploads/does-not-exist.jpg',
    link_path:'/how-it-works',source:'manual',status:'ready'
  },[facebookId]);
  const status=await S.dispatchPost(failed);
  assert.equal(status[0].status,'error');
  assert.match(status[0].error,/does not exist/);
  assert.equal(fbSent,1,'Broken images must not be sent to Buffer');
  assert.equal(S.getPost(failed).status,'failed');
  // Daily default must be off until explicitly enabled by an admin.
  assert.equal(S.setting('social_auto_enabled'),'0');
  S.db.close();
  console.log('Editorial seed, link targets, GPT-5.4 mini, Buffer metadata and duplicate-safety tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
