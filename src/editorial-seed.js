// Polished evergreen editorial content based on WatAir's published product and process guidance.
// Seed only when absent; CMS edits and publication status are never overwritten.
module.exports = function seedEditorial(db) {
  const now=new Date().toISOString().replace('T',' ').slice(0,19);
  const articles=[
    {
      slug:'what-is-atmospheric-water-generation',
      title:'What is atmospheric water generation? A practical introduction',
      category:'Technology',
      excerpt:'Discover how water-from-air technology works, from air intake and condensation to treatment, storage and the conditions that affect daily output.',
      seo_title:'How Atmospheric Water Generation Works | WatAir UK',
      seo_description:'Understand how water-from-air systems work, what affects output, and why filtration and correct maintenance are essential.',
      image_url:'/uploads/imported/legacy/media/1023/about-us-banner.jpg',
      body_html:[
        '<p>Water is present in the atmosphere as invisible water vapour. Atmospheric Water Generation (AWG) makes use of that moisture by drawing in air, condensing water vapour and collecting the resulting water. It can provide a locally generated water source for applications ranging from a countertop unit to a large commercial installation.</p>',
        '<h2>From air to collected water</h2>',
        '<p>The basic process starts with air intake. Air is drawn into a generator and passes through filters suited to the equipment. The generator then uses cooling and condensation to recover moisture from that air. Collected water is subsequently handled through the model-specific filtration and treatment process, before storage or dispensing.</p>',
        '<p>This is a simplified explanation of a family of technologies, not an assurance that every device uses the same treatment stages. Each unit has its own operating instructions, components and maintenance requirements. Explore our <a href="/how-it-works">guide to the process</a> for a step-by-step overview.</p>',
        '<h2>Does it work in any climate?</h2>',
        '<p>Output depends heavily on ambient temperature and relative humidity. A machine rated for a particular number of litres per day is normally assessed under defined operating conditions. Actual daily production can be lower when the air is cooler or drier. That is why site-specific assessment matters before selecting a system.</p>',
        '<h2>What happens to the water?</h2>',
        '<p>Collection is only part of a safe drinking-water system. Filtration, treatment, hygiene, storage, cleaning and scheduled maintenance all matter. Users must follow the requirements for their specific machine and comply with applicable water-quality responsibilities. Read our <a href="/water-quality-maintenance">water quality and maintenance guidance</a>.</p>',
        '<h2>Where could AWG be useful?</h2>',
        '<p>Potential applications include homes, offices, hospitality, commercial workplaces and larger infrastructure or industrial environments. The right option depends on required daily output, local air conditions, energy availability, water treatment, storage and practical servicing. <a href="/products">Explore the WatAir product range</a> or <a href="/contact">discuss an application</a> with our team.</p>'
      ].join('')
    },
    {
      slug:'humidity-temperature-water-from-air-output',
      title:'Did you know? Humidity and temperature shape water-from-air output',
      category:'Did you know?',
      excerpt:'Rated litres per day is only part of the story. Learn why atmospheric conditions matter when planning a water-from-air system.',
      seo_title:'How Humidity Affects Water-from-Air Output | WatAir UK',
      seo_description:'Why humidity, temperature and rated test conditions matter for atmospheric water generator performance and sizing.',
      image_url:'/uploads/imported/legacy/media/1024/mains-water-banner.jpg',
      body_html:[
        '<p>Atmospheric water generators are often compared using their rated litres-per-day capacity. That number is useful for comparing models, but it should not be mistaken for a guaranteed amount of water every day, regardless of conditions.</p>',
        '<h2>Why does humidity matter?</h2>',
        '<p>Water-from-air technology relies on moisture carried by ambient air. When the air contains less recoverable moisture, a condensing water generator may collect less water over the same period. Temperature also affects how much vapour air can hold, so humidity and temperature need to be considered together.</p>',
        '<h2>Rated output versus real operation</h2>',
        '<p>Specifications commonly quote capacity against particular test conditions. For example, many WatAir product specifications identify the temperatures and humidity levels used for a rated output. Those values help with comparison but do not replace an assessment of the actual installation environment.</p>',
        '<p>Seasonal changes, operating hours and equipment configuration can all influence practical output. A thoughtful design begins with how much water is required, when it is needed and what environmental conditions are likely at the site.</p>',
        '<h2>A better way to select capacity</h2>',
        '<p>Start by estimating daily consumption and any peak demand. Then consider operating temperature, relative humidity, access to power, available space, water storage, treatment and maintenance. In a larger installation, the surrounding water supply strategy also matters.</p>',
        '<p>See our <a href="/products">full range of atmospheric water generators</a>, or <a href="/contact">contact WatAir</a> to discuss a system against the conditions in which it would actually operate.</p>'
      ].join('')
    },
    {
      slug:'choosing-atmospheric-water-generator-home-commercial',
      title:'Choosing an atmospheric water generator: home, workplace or industrial?',
      category:'Applications',
      excerpt:'Compare the practical considerations behind compact, commercial and industrial water-from-air systems before selecting a model.',
      seo_title:'Choosing an Atmospheric Water Generator | WatAir UK',
      seo_description:'A practical guide to selecting AWG capacity for homes, offices, commercial properties and industrial applications.',
      image_url:'/uploads/imported/legacy/images/home/products.jpg',
      body_html:[
        '<p>Atmospheric water generation can be scaled across very different applications, but the principles of sound equipment selection remain much the same. Begin with the water requirement and the installation environment rather than choosing solely by the largest advertised capacity.</p>',
        '<h2>Compact and home-office systems</h2>',
        '<p>Compact units can be suited to locations where point-of-use water provision and a manageable footprint matter. The WatAir home and office range includes countertop and standing models. The actual choice should consider the number of users, water demand, placement, power, temperature and humidity. <a href="/products/home-office">Browse home and office systems</a>.</p>',
        '<h2>Commercial and industrial installations</h2>',
        '<p>Higher demand calls for a broader review of daily consumption, storage and infrastructure. WatAir lists commercial and industrial models with rated capacities extending into several thousand litres per day. The wider installation may require appropriate storage, distribution, power provision and a defined maintenance plan. <a href="/products/commercial-industrial">Browse commercial and industrial systems</a>.</p>',
        '<h2>Five practical questions to ask</h2>',
        '<ul><li>How much water is required during a normal day and at peak periods?</li><li>What temperature and relative humidity can be expected throughout the year?</li><li>What space, power, ventilation and water storage are available?</li><li>What filtration, treatment, cleaning and monitoring does the particular system require?</li><li>How will the system be serviced, and who is responsible for water hygiene?</li></ul>',
        '<h2>Specification is a starting point</h2>',
        '<p>Product specifications provide essential comparisons, but final suitability depends on the real installation conditions and how the water will be used. The <a href="/how-it-works">technology overview</a> and <a href="/water-quality-maintenance">maintenance guidance</a> are useful companions to the model pages.</p>',
        '<p>If you are comparing options for a project, <a href="/contact">contact WatAir</a> with your estimated demand and site details so the conversation starts with the practical requirements.</p>'
      ].join('')
    }
  ];
  const insert=db.prepare('INSERT OR IGNORE INTO news_articles(slug,title,category,excerpt,body_html,image_url,seo_title,seo_description,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const tx=db.transaction(()=>{
    for(const a of articles)insert.run(a.slug,a.title,a.category,a.excerpt,a.body_html,a.image_url,a.seo_title,a.seo_description,'published',now);
  });
  tx();
};
