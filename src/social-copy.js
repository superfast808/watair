// Social copywriting brief for WatAir posts: rotating angles, a verified fact
// bank and per-platform text fitting. Kept separate from editorial.js so the
// prompt and facts can be tuned without touching delivery code.

// Each angle is a different shape of post, so the feed doesn't read the same
// every day. `kicker` is printed on the image card above the headline.
const ANGLES = [
  {id:'did-you-know', kicker:'Did you know?', name:'Surprising fact',
    brief:'Open with one genuinely surprising, true fact from the supplied facts, stated plainly (do not literally start with "Did you know"). Then explain in 2–3 short lines why it matters to the reader.'},
  {id:'myth-vs-fact', kicker:'Myth vs fact', name:'Myth vs fact',
    brief:'Open by naming a common misconception about water from air in a few words (e.g. "Myth: …"). Then correct it with the supplied facts. Make the correction the satisfying part.'},
  {id:'picture-this', kicker:'Picture this', name:'Scenario',
    brief:'Open with a short, vivid, everyday scenario the reader recognises (an office kitchen, a site cabin, a busy café, a home with bottled-water deliveries). Do not invent customers, case studies or results; keep it hypothetical ("Picture…", "Imagine…"). Then show how the supplied facts fit that scene.'},
  {id:'by-the-numbers', kicker:'By the numbers', name:'Striking number',
    brief:'Lead with the single most striking number in the supplied facts (bottle equivalents, litres, temperatures, stages of treatment). Make the number the first thing read, then give it context in plain words.'},
  {id:'how-it-works', kicker:'How it works', name:'Quick explainer',
    brief:'Hook with a curiosity question, then explain the process in exactly three crisp steps, one per line, each starting with an arrow (→). Finish with one line on why it matters.'},
  {id:'quick-question', kicker:'Quick question', name:'Question to the audience',
    brief:'Open with a direct question that makes a facilities manager, business owner or homeowner stop and think. Answer it with the facts in 2–3 lines, then invite them to reply or read more.'},
  {id:'worth-knowing', kicker:'Worth knowing', name:'Practical tips',
    brief:'Hook with a practical promise (e.g. "Three things to check before…"), then give exactly three short tips as lines starting with •, drawn only from the facts.'},
  {id:'spotlight', kicker:'Product spotlight', name:'Product spotlight', productOnly:true,
    brief:'Introduce the model by what it does for someone, not by its model number. Lead with the most appealing concrete detail (hot and cold dispensing, the output, the footprint, the treatment stages), then 2–3 specific details from the spec. Mention the model name once.'}
];
const angleById = id => ANGLES.find(a=>a.id===id);

// Verified facts lifted from the site's own published pages, FAQs and specs.
// Specific and concrete on purpose: specifics are what make a post interesting.
const FACTS = {
  core: [
    'Air always carries some invisible water vapour. An atmospheric water generator (AWG) cools air to its dew point so that vapour condenses into liquid water — the same physics as droplets forming on a cold glass.',
    'The process: air is drawn in through a filter, cooled until moisture condenses, and the collected water then passes through multi-stage filtration and sterilisation before it is stored ready to use.',
    'An AWG needs no mains water feed to make water. It needs electricity and air within the model\'s operating temperature and humidity range.',
    'When the storage tank is full, the control system stops production.',
    'The WatAir range runs from a 20 litre/day countertop unit up to industrial systems rated at 10,000 litres a day.',
    'Litres-per-day figures are rated outputs at stated test conditions (for the compact models, 30°C and 80% relative humidity). Cooler or drier air means less water, so real output depends on the site.'
  ],
  technology: [
    'Stage 1, air intake: ambient air is drawn through a filter to reduce airborne particles.',
    'Stage 2, condensation: the air is cooled to its dew point and moisture condenses into water.',
    'Stage 3, purification: multi-stage filtration and sterilisation prepare the water before storage and dispensing.',
    'The PW HR-20L countertop unit treats water through an air filter, softening, sediment filter, ultrafiltration membrane, post-carbon filter and LED-UV.',
    'The PW HR-30L and PW HR-60L list 13 stages of filtration and sterilisation.',
    'Humidity describes how much water vapour is in the air. More available moisture generally means a generator collects water more efficiently.'
  ],
  applications: [
    'WatAir systems can support homes, offices, hospitality, construction, remote sites, emergency planning and larger commercial facilities.',
    'Compact units sit on a countertop or stand on the floor and dispense hot and cold water; larger units feed external tanks.',
    'The PW HR-20L countertop unit dispenses hot water at 82°C and cold water at 6°C from an 8 litre internal tank.',
    'Many compact units need no plumbing at all — just power. Larger commercial systems are planned with the site\'s storage and distribution.',
    'Choosing a model starts with: litres needed per day, location, temperature and humidity, intended use, power supply, storage, and whether hot/cold dispensing is wanted.'
  ],
  environment: [
    'Bottled water carries impacts beyond the water itself: packaging, manufacture, transport, storage and waste handling.',
    'Making water at the point of use cuts out the delivery cycle: no deliveries to schedule, no crates to store, no empties to collect.',
    'A 20 litre/day rated unit makes the equivalent of 40 half-litre bottles a day at rated conditions.',
    'The honest environmental case depends on local energy, humidity, temperature, maintenance and what it replaces — WatAir sizes systems around the real requirement.'
  ],
  resilience: [
    'Producing water on site adds a source that doesn\'t depend on deliveries or a single supply.',
    'Larger systems can support remote locations where a conventional supply is difficult or expensive to provide.',
    'For resilience, size for peak demand and for lower-output days rather than an average — and plan storage to match.',
    'WatAir commercial and industrial units feed external tanks, so storage can be sized to the site.'
  ],
  'water-quality': [
    'An AWG is a drinking-water system as well as a refrigeration appliance; good water depends on following the model\'s operator manual and service schedule.',
    'Filters, UV or other sterilisation components, tanks, air paths and refrigeration parts all need inspection or replacement on a schedule that depends on model, use and local conditions.',
    'Treatment varies by model: the PW HR-20L uses air filtration, softening, sediment, ultrafiltration, post-carbon and LED-UV; the PW HR-30L and HR-60L list 13 stages.',
    'Each WatAir product page has a downloadable datasheet with the full treatment specification.'
  ],
  industry: [
    'WatAir\'s commercial and industrial range runs from 80 litres/day to systems rated at 10,000 litres/day.',
    'The PW HR-10000L is rated at 10,000 litres a day — the equivalent of 20,000 half-litre bottles at rated conditions.',
    'From the PW HR-100L upwards, WatAir commercial units list working ranges of 15–45°C and 30–100% relative humidity, and CE, CB, UL and IEC certificates.',
    'Big installations are planned around daily demand, storage, distribution, power provision and a defined maintenance plan.',
    'WatAir can help specify a project from the site location, approximate litres per day, intended use, operating environment and power or storage constraints.'
  ]
};
FACTS['did-you-know'] = [...FACTS.core, ...FACTS.technology.slice(5)];
FACTS.product = FACTS.applications;

// Facts that fit best when the post links to a product page.
const SPEC_SKIP = /power consumption|input power|power supply|refrigerant|net weight/i; // ambiguous units or dull
function productFacts(p) {
  let specs = {};
  try { specs = JSON.parse(p.specs_json || '{}'); } catch {}
  const lines = [];
  lines.push(`${p.name}${p.subtitle ? ' (' + p.subtitle + ')' : ''}: ${p.summary || ''}`.trim());
  for (const [k, v] of Object.entries(specs)) if (!SPEC_SKIP.test(k)) lines.push(`${k}: ${v}`);
  const lpd = Number(p.capacity_lpd) || 0;
  if (lpd) {
    lines.push(`Rated output ${lpd.toLocaleString('en-GB')} litres/day — the equivalent of ${(lpd * 2).toLocaleString('en-GB')} half-litre bottles a day at rated conditions.`);
  }
  lines.push(p.category === 'home-office' ? 'Category: home and office.' : 'Category: commercial and industrial.');
  lines.push('No mains water feed is needed to make water; output varies with temperature and humidity.');
  return lines;
}
function htmlToText(html) {
  return String(html || '').replace(/<\/(p|h2|h3|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
function articleFacts(a) {
  const body = htmlToText(a.body_html).slice(0, 3200);
  return [a.excerpt, body].filter(Boolean);
}

// Deterministic-but-varied choice: rotate by day, skipping angles used recently.
function chooseAngle({topic, day = 0, recentAngles = [], requested = ''}) {
  const wanted = angleById(requested);
  if (wanted && (!wanted.productOnly || topic === 'product')) return wanted;
  const pool = ANGLES.filter(a => topic === 'product' ? ['spotlight','by-the-numbers','picture-this','quick-question','myth-vs-fact'].includes(a.id) : !a.productOnly);
  const fresh = pool.filter(a => !recentAngles.slice(0, 3).includes(a.id));
  const list = fresh.length ? fresh : pool;
  return list[Math.abs(day) % list.length];
}
function pickFacts(list, day, count) {
  if (list.length <= count) return list.slice();
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[(day * 3 + i) % list.length]);
  return [...new Set(out)];
}

const SYSTEM = [
  'You write social media posts for WatAir UK, which supplies atmospheric water generators — machines that make drinking water from the moisture in the air — from countertop units to industrial systems.',
  '',
  'VOICE: confident, curious, plain-spoken British English. Write like a knowledgeable person talking to a facilities manager, business owner or curious homeowner. Not a brochure. Not a legal disclaimer. Short sentences, concrete nouns, one idea per post.',
  '',
  'WHAT MAKES IT WORK:',
  '- The first line is everything. It must stop the scroll on its own: a surprising fact, a sharp question, a vivid scene, a myth, or a striking number. Under 100 characters.',
  '- Never open with: "Did you know", "At WatAir", "In today\'s world", "Introducing", "Discover", "Are you looking for", "Ever wondered", or the company name.',
  '- Then 2–4 short paragraphs or lines that pay off the hook with specifics from the facts. Put a blank line between paragraphs.',
  '- End with one natural call to action that fits the link (read the explainer, see the full spec, tell us about your site). Not "Contact us today!".',
  '- Emoji: zero to two, only where they add meaning. Hashtags: two or three specific ones on the final line (e.g. #WaterFromAir #AtmosphericWater), never inside sentences.',
  '- Never use: revolutionary, game-changer, cutting-edge, innovative, unlock, harness, elevate, seamless, empower, journey, "sustainable future", "look no further", "dive in", "in conclusion".',
  '',
  'ACCURACY (non-negotiable, but it must not flatten the writing):',
  '- Use only the facts supplied. Never invent figures, prices, customers, installations, case studies, certifications, savings, awards or comparisons.',
  '- When quoting a litres-per-day figure, call it rated (e.g. "rated at 250 litres a day"). One light qualifier like that is enough — do not add paragraphs of caveats or repeat them.',
  '- Do not claim water is safe to drink without the treatment being part of the story, and do not claim it works in every climate.',
  '',
  'Return ONE valid JSON object and nothing else.'
].join('\n');

function buildRequest({angle, topic, target, facts, url, recentHooks = []}) {
  return {
    task: 'Write one social post.',
    angle: {name: angle.name, how_to_write_it: angle.brief},
    theme: topic.replace(/-/g, ' '),
    linked_page: {title: target.title, note: 'The URL is attached automatically after your text. Do not include any URL or "link below/in bio" wording.', url},
    verified_facts: facts,
    avoid_repeating_these_recent_openings: recentHooks.slice(0, 10),
    output: {
      hooks: 'array of 3 alternative first lines in clearly different styles',
      hook: 'the strongest of the three',
      caption: 'the full post for LinkedIn/Facebook/Instagram, starting with the chosen hook. 45–110 words plus the hashtag line. No URL.',
      short: 'a standalone version for X/Bluesky/Threads: maximum 200 characters including at most 2 hashtags. Punchy, same hook idea. No URL.',
      image_headline: 'max 60 characters of text to print on the image: bold, readable at a glance, works without the caption. No hashtags, emoji or full stop at the end.',
      headline: 'an internal working title, max 80 characters'
    }
  };
}

// ---- Per-platform text -----------------------------------------------------
const SHORT_LIMITS = {twitter: 280, x: 280, bluesky: 300, threads: 500, mastodon: 500};
const URL_RE = /\bhttps?:\/\/\S+/gi;
function stripUrls(s) { return String(s || '').replace(URL_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function splitHashtags(text) {
  const lines = String(text || '').trim().split('\n');
  const last = (lines[lines.length - 1] || '').trim();
  if (lines.length > 1 && /^(#[\p{L}\p{N}_]+\s*)+$/u.test(last)) return {body: lines.slice(0, -1).join('\n').trim(), tags: last};
  return {body: String(text || '').trim(), tags: ''};
}
// Fit text + link into a character limit: drop hashtags, then cut at a
// sentence boundary, then at a word boundary.
function fitToLimit(text, link, limit) {
  const join = (t, tags) => [t, link, tags].filter(Boolean).join('\n\n');
  const {body, tags} = splitHashtags(stripUrls(text));
  if ([...join(body, tags)].length <= limit) return join(body, tags);
  if ([...join(body, '')].length <= limit) return join(body, '');
  const room = limit - (link ? [...link].length + 2 : 0) - 1;
  const flat = body.replace(/\s*\n+\s*/g, ' ');
  const sentences = flat.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [flat];
  let out = '';
  for (const s of sentences) { if ((out + s).trim().length > room) break; out += s; }
  out = out.trim();
  if (out.length < 40) out = flat.slice(0, room).replace(/\s+\S*$/, '') + '…';
  return join(out, '');
}
function textForService(post, service, link) {
  const svc = String(service || '').toLowerCase();
  const long = stripUrls(post.caption);
  if (SHORT_LIMITS[svc]) {
    const short = stripUrls(post.caption_short) || long;
    return fitToLimit(short, link, SHORT_LIMITS[svc]);
  }
  const {body, tags} = splitHashtags(long);
  if (svc === 'instagram') {
    // Links in Instagram captions aren't clickable; give a readable domain instead.
    const domain = link ? new URL(link).hostname.replace(/^www\./, '') : '';
    return [body, domain ? 'More at ' + domain : '', tags].filter(Boolean).join('\n\n');
  }
  // LinkedIn, Facebook, Google etc.: link sits above the hashtags.
  return [body, link, tags].filter(Boolean).join('\n\n');
}
function kickerFor(post) {
  const a = angleById(post.angle);
  if (a) return a.kicker;
  const labels = {'did-you-know':'Did you know?', technology:'How it works', product:'Product spotlight', applications:'In practice', 'water-quality':'Water quality', resilience:'Water resilience', industry:'Commercial & industrial', environment:'Environment'};
  return labels[post.topic] || '';
}

module.exports = {ANGLES, angleById, FACTS, SYSTEM, productFacts, articleFacts, htmlToText, chooseAngle, pickFacts, buildRequest, stripUrls, splitHashtags, fitToLimit, textForService, kickerFor, SHORT_LIMITS};
