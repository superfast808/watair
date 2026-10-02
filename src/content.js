const products = [
  {
    slug: 'pw-hr-15l', name: 'PW HR-15L', category: 'home-office', capacity_lpd: 16,
    summary: 'Compact hot and cold atmospheric water generator for homes and smaller workplaces.',
    specs: { 'Output': 'Hot & cold', 'Storage capacity': '8 Litres', 'Water generated': '16 Litres/day generated at 30°C & 80% RH', 'Working temperature': '15–40°C', 'Working humidity': '35–95%', 'Dimensions': '45 × 44 × 56 cm', 'Net weight': '36 kg', 'Refrigerant': 'R134a', 'Total wattage': '900 W' }
  },
  {
    slug: 'pw-hr-25l-low-power-consumption', name: 'PW HR-25L', subtitle: 'Low Power Consumption', category: 'home-office', capacity_lpd: 25,
    summary: 'Efficient hot and cold water generation with a compact floor-standing footprint.',
    specs: { 'Output': 'Cold 6–10°C / Hot 92°C', 'Storage capacity': '13.5 Litres', 'Water generated': '25 Litres/day generated at 30°C & 80% RH', 'Working temperature': '15–40°C', 'Working humidity': '20–95%', 'Dimensions': '37.5 × 31 × 114 cm', 'Net weight': '42 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '0.5 kWh' }
  },
  {
    slug: 'pw-hr-30l', name: 'PW HR-30L', category: 'home-office', capacity_lpd: 30,
    summary: 'Hot and cold drinking water generation for homes, offices and hospitality spaces.',
    specs: { 'Output': 'Hot & cold', 'Storage capacity': '12.5 Litres', 'Water generated': '30 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '13 stage', 'Water temperature': '4–95°C', 'Working temperature': '15–40°C', 'Working humidity': '35–95%', 'Dimensions': '45 × 43 × 112 cm', 'Net weight': '49 kg', 'Refrigerant': 'R134a' }
  },
  {
    slug: 'pw-hr-60l', name: 'PW HR-60L', category: 'home-office', capacity_lpd: 60,
    summary: 'Higher-capacity home and office unit producing up to 60 litres per day.',
    specs: { 'Output': 'Hot & cold', 'Storage capacity': '45 Litres', 'Water generated': '60 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '13 stage', 'Working temperature': '15–40°C', 'Working humidity': '35–95%', 'Dimensions': '59 × 59 × 111 cm', 'Net weight': '90 kg', 'Refrigerant': 'R407c / R410' }
  },
  {
    slug: 'pw-hr-80l-low-power-consumption', name: 'PW HR-80L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 80,
    summary: 'Entry-level commercial atmospheric water generator with external tank support.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '80 Litres/day', 'Working temperature': '15–40°C', 'Working humidity': '30–95%', 'Dimensions': '52 × 67 × 110 cm', 'Net weight': '70 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '1.25 kWh' }
  },
  {
    slug: 'pw-hr-100l', name: 'PW HR-100L', category: 'commercial-industrial', capacity_lpd: 100,
    summary: 'Commercial-scale unit for workplaces, facilities and remote applications.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '100 Litres', 'Water generated': '100 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '10 stage', 'Working temperature': '15–38°C', 'Working humidity': '45–95%', 'Dimensions': '142 × 65 × 105 cm', 'Net weight': '190 kg', 'Refrigerant': 'R407c', 'Noise level': '<75 dB' }
  },
  {
    slug: 'pw-hr-100l-low-power-consumption', name: 'PW HR-100L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 100,
    summary: 'Low-energy commercial unit with external water storage.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '100 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '75 × 69 × 164 cm', 'Net weight': '195 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '1.33 kWh' }
  },
  {
    slug: 'pw-hr-250l', name: 'PW HR-250L', category: 'commercial-industrial', capacity_lpd: 250,
    summary: 'Mid-capacity commercial generator with integrated water storage.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '110 Litres', 'Water generated': '250 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '17 stage', 'Working temperature': '15–38°C', 'Working humidity': '45–95%', 'Dimensions': '160 × 72 × 128 cm', 'Net weight': '320 kg', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-250l-low-power-consumption', name: 'PW HR-250L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 250,
    summary: 'Efficient 250 litre-per-day atmospheric water generator.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '250 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '127 × 108 × 104 cm', 'Net weight': '350 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '2.45 kWh' }
  },
  {
    slug: 'pw-hr-500l', name: 'PW HR-500L', category: 'commercial-industrial', capacity_lpd: 500,
    summary: 'Robust commercial system producing up to 500 litres of drinking water per day.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '240 Litres', 'Water generated': '500 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '13 stage', 'Working temperature': '15–38°C', 'Working humidity': '45–95%', 'Dimensions': '235 × 85 × 145 cm', 'Net weight': '560 kg', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-500l-low-power-consumption', name: 'PW HR-500L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 500,
    summary: 'Energy-conscious 500 litre-per-day unit for larger facilities.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '500 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '157 × 108 × 124 cm', 'Net weight': '600 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '4.3 kWh' }
  },
  {
    slug: 'pw-hr-1000l', name: 'PW HR-1000L', category: 'commercial-industrial', capacity_lpd: 1000,
    summary: 'Industrial atmospheric water generation at up to 1,000 litres per day.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '240 Litres', 'Water generated': '1,000 Litres/day generated at 30°C & 80% RH', 'Filtration & sterilisation': '9 stage', 'Working temperature': '15–38°C', 'Working humidity': '45–95%', 'Dimensions': '280 × 180 × 162 cm', 'Net weight': '2,000 kg', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-1000l-low-power-consumption', name: 'PW HR-1000L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 1000,
    summary: 'High-output, lower-power system with external tank options.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '1,000 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '190 × 156 × 163 cm', 'Net weight': '850 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '8.7 kWh' }
  },
  {
    slug: 'pw-hr-2000l-low-power-consumption', name: 'PW HR-2000L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 2000,
    summary: 'Two-thousand litre-per-day generation for industrial and infrastructure requirements.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '2,000 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '222 × 156 × 202 cm', 'Net weight': '1,000 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '17.5 kWh' }
  },
  {
    slug: 'pw-hr-3000l', name: 'PW HR-3000L', category: 'commercial-industrial', capacity_lpd: 3000,
    summary: 'Large industrial atmospheric water generator with integrated storage.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '1,200 Litres', 'Water generated': '3,000 Litres/day generated at 30°C & 80% RH', 'Working temperature': '15–38°C', 'Working humidity': '45–95%', 'Dimensions': '400 × 220 × 220 cm', 'Net weight': '2,500 kg', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-4000l-low-power-consumption', name: 'PW HR-4000L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 4000,
    summary: 'Four-thousand litre-per-day production for demanding industrial deployments.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '4,000 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '314 × 156 × 202 cm', 'Net weight': '2,800 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '35 kWh' }
  },
  {
    slug: 'pw-hr-5000l', name: 'PW HR-5000L', category: 'commercial-industrial', capacity_lpd: 5000,
    summary: 'Large-scale water-from-air production for buildings and industrial sites.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '1,800 Litres', 'Water generated': '5,000 Litres/day generated at 30°C & 80% RH', 'Working temperature': '20–32°C', 'Working humidity': '45–95%', 'Dimensions': '530 × 220 × 220 cm', 'Net weight': '3,200 kg', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-5500l-low-power-consumption', name: 'PW HR-5500L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 5500,
    summary: 'High-efficiency large-scale system producing up to 5,500 litres per day.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '5,500 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '314 × 317 × 203 cm', 'Net weight': '3,200 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '35 kWh' }
  },
  {
    slug: 'pw-hr-8000l-low-power-consumption', name: 'PW HR-8000L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 8000,
    summary: 'Eight-thousand litre-per-day output for major facilities and resilient water supply.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '8,000 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '444 × 317 × 203 cm', 'Net weight': '5,600 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '60 kWh' }
  },
  {
    slug: 'pw-hr-10000l', name: 'PW HR-10000L', category: 'commercial-industrial', capacity_lpd: 10000,
    summary: 'Maximum-scale integrated generation for building and infrastructure applications.',
    specs: { 'Output': 'Ambient', 'Storage capacity': '2,600 Litres', 'Water generated': '10,000 Litres/day generated at 30°C & 80% RH', 'Working temperature': '20–32°C', 'Working humidity': '45–95%', 'Dimensions': '530 × 220 × 220 cm (×2)', 'Net weight': '3,200 kg (×2)', 'Refrigerant': 'R407c', 'Noise level': '<79 dB' }
  },
  {
    slug: 'pw-hr-10000l-low-power-consumption', name: 'PW HR-10000L', subtitle: 'Low Power Consumption', category: 'commercial-industrial', capacity_lpd: 10000,
    summary: 'Ten-thousand litre-per-day low-power configuration with external storage.',
    specs: { 'Output': 'Ambient', 'Storage capacity': 'External tanks', 'Water generated': '10,000 Litres/day', 'Working temperature': '15–45°C', 'Working humidity': '30–100%', 'Dimensions': '627 × 624 × 203 cm', 'Net weight': '6,400 kg', 'Refrigerant': 'R134a', 'Certificates': 'CE, CB, UL, IEC', 'Power consumption': '87.5 kWh' }
  }
];

const pages = [
  {
    slug: 'how-it-works', title: 'How it works', eyebrow: 'Water from air',
    hero: 'Generating fresh drinking water from the air',
    intro: 'Atmospheric Water Generators draw in humid air, condense its moisture, then filter and treat the collected water for use as fresh drinking water.',
    body: `<h2>From atmosphere to drinking water</h2><p>WatAir systems use controlled condensation to extract moisture from ambient air. The water then passes through filtration and treatment stages before being stored ready for use.</p><div class="process-grid"><div><span>01</span><h3>Air intake</h3><p>Ambient air is drawn through filtration to reduce airborne particles.</p></div><div><span>02</span><h3>Condensation</h3><p>The air is cooled to its dew point so moisture condenses into water.</p></div><div><span>03</span><h3>Purification</h3><p>Multi-stage filtration and sterilisation prepare the water for drinking.</p></div><div><span>04</span><h3>Fresh water</h3><p>Treated water is stored and dispensed at the point of use.</p></div></div><h2>Designed for the UK climate</h2><p>Output depends on temperature and relative humidity. The UK’s generally humid climate can make atmospheric water generation particularly relevant, while each model has its own operating range shown on the product specification page.</p>`
  },
  {
    slug: 'about', title: 'About WatAir', eyebrow: 'About',
    hero: 'A practical route to local water resilience',
    intro: 'WatAir UK was formed to promote Atmospheric Water Generation technology across the UK, from compact home and office systems to large industrial installations.',
    body: `<h2>Water generated where it is needed</h2><p>Our range spans compact systems for homes and workplaces through to industrial units capable of generating thousands of litres per day. The objective is simple: reduce dependence on transported bottled water and provide a local source of drinking water where the operating conditions are suitable.</p><h2>From homes to infrastructure</h2><p>Atmospheric Water Generation can support offices, hospitality, construction, remote sites, emergency planning and larger commercial facilities. Our team can help assess expected demand, environmental conditions, installation requirements and the most suitable capacity.</p>`
  },
  {
    slug: 'plastic-bottles', title: 'Plastic bottles', eyebrow: 'Environment',
    hero: 'Reduce reliance on transported bottled water',
    intro: 'Generating drinking water at the point of use can reduce the storage, transport and single-use plastic associated with bottled water supply.',
    body: `<h2>Water without the delivery cycle</h2><p>Bottled water carries impacts beyond the water itself: packaging, manufacture, transport, storage and waste handling. Atmospheric Water Generation offers an alternative where conditions and energy supply make it appropriate.</p><h2>Measure the right outcome</h2><p>The environmental case should be assessed against local energy, humidity, temperature, maintenance and the alternative source being displaced. WatAir can help size a system around the actual requirement rather than a one-size-fits-all claim.</p>`
  },
  {
    slug: 'mains-water', title: 'Mains water', eyebrow: 'Environment',
    hero: 'A complementary source of water at the point of use',
    intro: 'Atmospheric Water Generation can reduce demand on transported or mains-supplied drinking water in applications where local generation makes operational sense.',
    body: `<h2>Resilience and independence</h2><p>For some facilities, producing drinking water on site can add resilience and reduce dependency on a single source. Larger systems can also support remote locations where conventional supply is difficult or expensive.</p><h2>Designed around real conditions</h2><p>Production varies with humidity and temperature, so every deployment should be assessed against local conditions, electrical capacity, storage and required daily volume.</p>`
  },
  {
    slug: 'resellers', title: 'Become a reseller', eyebrow: 'Partners',
    hero: 'Bring atmospheric water generation to your market',
    intro: 'We welcome conversations with organisations interested in representing WatAir solutions in suitable sectors and territories.',
    body: `<h2>Partner with WatAir</h2><p>If your business works in sustainability, facilities, water services, resilience, construction or related sectors, talk to us about reseller opportunities.</p><p>We can discuss product range, territory, technical support and the commercial model.</p>`
  },
  {
    slug: 'leasing', title: 'Leasing', eyebrow: 'Flexible procurement',
    hero: 'Explore a lower-upfront-cost route to water from air',
    intro: 'Selected WatAir systems may be suitable for leasing or finance arrangements depending on the installation and customer requirements.',
    body: `<h2>Talk to us about the requirement</h2><p>Rather than forcing every project into the same purchasing model, we can discuss the application, expected output and preferred commercial approach.</p>`
  },
  {
    slug: 'privacy', title: 'Privacy notice', eyebrow: 'Privacy & data',
    hero: 'How WatAir handles information submitted through this website',
    intro: 'This notice explains what information the WatAir website collects, why it is used and how to contact us about your personal information.',
    body: `<p><strong>Last updated: October 2026.</strong></p><h2>Who we are</h2><p>WatAir UK is responsible for the personal information collected through this website. You can contact us using the email address or telephone number shown in the website footer and contact page.</p><h2>Information we collect</h2><p>If you send an enquiry through this website, we may collect your name, company, email address, telephone number, the subject of your enquiry, your message and basic technical information such as the IP address used to submit the form.</p><h2>Why we use it and our lawful basis</h2><p>We use enquiry information to respond to your request, discuss WatAir products or services and maintain an appropriate record of customer and project correspondence. Depending on the nature of the enquiry, this processing is generally necessary to take steps at your request before entering into a contract and/or is carried out for WatAir’s legitimate interests in responding to business enquiries and managing customer relationships.</p><h2>Who receives the information</h2><p>Information submitted through the contact form is stored within the WatAir website system and may also be sent to the configured WatAir contact mailbox. Hosting, email and IT service providers may process information on WatAir’s behalf where needed to operate these services. We do not sell personal information submitted through this website.</p><h2>How long information is kept</h2><p>Enquiry records are retained only for as long as reasonably necessary for the enquiry, any resulting business relationship, and relevant administrative or legal requirements. Website administrators can remove enquiry records from the CMS when they are no longer required.</p><h2>Is the information required?</h2><p>You are not under a statutory obligation to submit an enquiry through the website. We need a name, valid email address and message if you want us to respond through the contact form; other fields are optional.</p><h2>Your rights</h2><p>Depending on the circumstances, UK data protection law may give you rights to ask for access to your personal information, correction, deletion or restriction of its use, and to object to certain processing. Where applicable, you may also have a right to data portability. Contact WatAir if you want to exercise a data protection right.</p><h2>Complaints</h2><p>If you have concerns about how WatAir uses your personal information, please contact us first so we can try to resolve them. You also have the right to complain to the UK Information Commissioner’s Office (ICO). More information is available at <a href="https://ico.org.uk/" target="_blank" rel="noopener">ico.org.uk</a>.</p><h2>Automated decisions and profiling</h2><p>The website does not use contact-form information to make solely automated decisions about you or to profile you for advertising.</p><h2>Cookies</h2><p>The public website does not currently use non-essential analytics or advertising cookies. The password-protected CMS uses an essential sign-in cookie for administrator sessions.</p><h2>Changes to this notice</h2><p>We may update this notice when the website, our service providers or our use of personal information changes. The latest version will be published on this page.</p>`
  }];

const faqs = [
  ['What does an Atmospheric Water Generator do?', 'An Atmospheric Water Generator (AWG) draws in ambient air, cools it so moisture condenses into water, then passes that water through model-specific filtration and treatment before storage and dispensing.', 'Basics'],
  ['Does an AWG need a mains water connection?', 'No mains water feed is required to generate water. The machine does need a suitable electrical supply and operating conditions within the model’s specified temperature and humidity range.', 'Basics'],
  ['Does it work in the UK climate?', 'It can. The UK often has useful levels of relative humidity, but actual output varies with both humidity and temperature. Published daily capacities are rated at stated test conditions, so real-site performance should always be assessed before specifying a unit.', 'Basics'],
  ['Can the machine make water every day?', 'Potentially, provided the surrounding air remains within the machine’s operating envelope. Production falls as conditions become cooler or drier, so expected daily demand should be matched against the local environment.', 'Performance & sizing'],
  ['Why does humidity matter so much?', 'Humidity describes how much water vapour is present in the air. More available moisture generally means the generator can collect water more efficiently; lower humidity normally reduces output.', 'Performance & sizing'],
  ['Are the quoted litre-per-day figures guaranteed?', 'No. They are rated outputs measured at specific temperature and relative-humidity conditions. Site temperature, humidity, airflow, maintenance and installation conditions all affect real production.', 'Performance & sizing'],
  ['How do I choose the right WatAir model?', 'Start with required litres per day, location, temperature and humidity, intended use, available electrical supply, storage requirements and whether hot/cold dispensing is needed. WatAir can then narrow the range.', 'Performance & sizing'],
  ['Can I oversize a system for resilience?', 'Yes, and for some projects that can be sensible. The design should consider peak demand, seasonal conditions, storage capacity and the consequence of lower-output days rather than sizing only to an average figure.', 'Performance & sizing'],
  ['Do the units need plumbing?', 'Many compact units do not require a mains water connection. Depending on the model and installation, drainage, external tanks or distribution pipework may still be appropriate. Larger commercial systems are usually planned as part of the wider site setup.', 'Installation & operation'],
  ['Do the units need special electrical work?', 'Smaller units may operate from a normal UK electrical supply, while larger commercial and industrial equipment has greater power requirements. Always use the electrical specification for the selected model and have the installation assessed appropriately.', 'Installation & operation'],
  ['What happens when the storage tank is full?', 'The control system is intended to stop water production when the configured storage level is reached, preventing normal operation from continuously filling the tank.', 'Installation & operation'],
  ['Can an AWG be installed outdoors?', 'That depends on the selected model and the environmental protection provided. Equipment should only be installed in conditions permitted by its specification, with appropriate ventilation, weather protection and service access.', 'Installation & operation'],
  ['How much ventilation does an AWG need?', 'The machine needs adequate airflow to process ambient air and reject heat. Clearances and ventilation should be considered when choosing the installation location, particularly for larger-capacity systems.', 'Installation & operation'],
  ['How is the generated water treated?', 'WatAir models use combinations of air filtration, water filtration and sterilisation. The number and type of treatment stages vary by model, so the product specification should be checked for the exact configuration.', 'Water quality & maintenance'],
  ['Does the water system need regular maintenance?', 'Yes. Filters, sterilisation components, tanks, air paths and refrigeration equipment require inspection or replacement on an appropriate maintenance schedule. The interval depends on the model, usage and local conditions.', 'Water quality & maintenance'],
  ['Can the water sit in the internal tank?', 'Storage and circulation arrangements vary by model. As with any drinking-water system, tanks and treatment components should be maintained hygienically and according to the manufacturer’s operating guidance.', 'Water quality & maintenance'],
  ['Can an AWG replace every other water source?', 'Not necessarily. Atmospheric water generation is best assessed as one part of a site’s water strategy. Suitability depends on climate, required volume, power availability, storage, resilience requirements and the economics of the alternative supply.', 'Commercial projects'],
  ['Can WatAir systems support offices, hospitality or remote sites?', 'Those are all potential applications. The appropriate solution depends on the number of users, daily demand, operating conditions, available power, storage and how the generated water will be distributed.', 'Commercial projects'],
  ['How large can WatAir systems go?', 'The current published WatAir range extends from compact home and office units to industrial configurations rated at up to 10,000 litres per day under stated conditions.', 'Commercial projects'],
  ['Can I get a technical datasheet for each model?', 'Yes. Each product page provides a downloadable WatAir datasheet generated from the current published technical specification, alongside the on-page specification table.', 'Commercial projects'],
  ['Can WatAir help specify a project?', 'Yes. Send the site location, approximate litres required per day, intended use, operating environment and any storage or power constraints. That is usually enough to start narrowing the options.', 'Commercial projects']
];

module.exports = { products, pages, faqs };
