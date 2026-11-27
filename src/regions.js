'use strict';

// Dated references provide context, not a live drought or outage alert.
const regions = [
  {
    "slug": "cornwall",
    "name": "Cornwall",
    "title": "A supplementary water supply for Cornwall",
    "description": "Explore water-from-air systems for Cornwall homes, holiday parks and businesses facing water supply pressure. Request a WatAir site assessment.",
    "intro": "When reservoir levels and seasonal demand put local supplies under pressure, it makes sense to explore another source of water. WatAir helps you assess whether on-site atmospheric water generation could be part of your plan.",
    "context": "On 15 October 2026 the Government declared severe drought in parts of Cornwall. The Environment Agency’s 6–13 November update identified continued pressure on smaller reservoirs in west Cornwall. Holiday accommodation, coastal businesses and rural properties can plan ahead for future supply challenges.",
    "sources": [
      {
        "label": "Government drought announcement, 15 October 2026",
        "url": "https://www.gov.uk/government/news/government-activates-plan-to-protect-consumers-as-severe-drought-declared-in-parts-of-england"
      },
      {
        "label": "Environment Agency water update, 6–13 November 2026",
        "url": "https://www.gov.uk/government/publications/dry-weather-and-drought-in-england-2026-summary-reports/dry-weather-and-drought-in-england-6-to-13-november-2026"
      }
    ],
    "places": "Truro, Newquay, Falmouth, Penzance, St Austell and surrounding rural communities",
    "uses": [
      [
        "Holiday parks & accommodation",
        "Assess guest drinking-water demand and a shared dispensing point before the busy season."
      ],
      [
        "Rural homes & small businesses",
        "Explore a compact system for day-to-day drinking-water needs alongside existing supplies."
      ],
      [
        "Coastal cafés & workplaces",
        "Review bottled-water deliveries and on-site dispensing needs."
      ]
    ]
  },
  {
    "slug": "devon",
    "name": "Devon",
    "title": "Build water resilience in Devon",
    "description": "Atmospheric water generators for Devon farms, rural businesses, hospitality and homes. Ask WatAir about supplementary on-site drinking water.",
    "intro": "For rural sites, tourism businesses and workplaces, an additional source of water may make supply planning more flexible. Find out how WatAir could fit your operation.",
    "context": "Parts of Devon were included in the severe drought announcement on 15 October 2026. The Environment Agency’s November update highlighted ongoing pressure at Wimbleball and smaller Devon reservoirs. Sites with remote access or seasonal demand have different requirements from conventional offices.",
    "sources": [
      {
        "label": "Government drought announcement, 15 October 2026",
        "url": "https://www.gov.uk/government/news/government-activates-plan-to-protect-consumers-as-severe-drought-declared-in-parts-of-england"
      },
      {
        "label": "Environment Agency water update, 6–13 November 2026",
        "url": "https://www.gov.uk/government/publications/dry-weather-and-drought-in-england-2026-summary-reports/dry-weather-and-drought-in-england-6-to-13-november-2026"
      }
    ],
    "places": "Exeter, Plymouth, Torbay, North Devon and the surrounding countryside",
    "uses": [
      [
        "Farms & rural workplaces",
        "Assess drinking-water provision for staff and visitors, not bulk crop irrigation or livestock demand."
      ],
      [
        "Hotels & visitor attractions",
        "Plan around guest occupancy and peak daily drinking-water needs."
      ],
      [
        "Remote sites",
        "Assess available power, air conditions, storage and service access before selecting a system."
      ]
    ]
  },
  {
    "slug": "dorset-somerset",
    "name": "Dorset & Somerset",
    "title": "Plan for water supply pressure in Dorset and Somerset",
    "description": "Water-from-air systems for Dorset and Somerset hospitality, rural sites and workplaces. Explore a supplementary water source with WatAir.",
    "intro": "Business continuity starts with understanding the essentials. WatAir can help you explore a local water-generation option sized to your site's drinking-water requirements.",
    "context": "The Government’s 15 October 2026 severe drought announcement included parts of Dorset and Somerset. The Environment Agency’s November update reported ongoing resource pressure at Wimbleball Reservoir. Planning for demand peaks and backup arrangements is worthwhile even when normal supply resumes.",
    "sources": [
      {
        "label": "Government drought announcement, 15 October 2026",
        "url": "https://www.gov.uk/government/news/government-activates-plan-to-protect-consumers-as-severe-drought-declared-in-parts-of-england"
      },
      {
        "label": "Environment Agency water update, 6–13 November 2026",
        "url": "https://www.gov.uk/government/publications/dry-weather-and-drought-in-england-2026-summary-reports/dry-weather-and-drought-in-england-6-to-13-november-2026"
      }
    ],
    "places": "Dorchester, Weymouth, Bournemouth, Taunton, Yeovil and surrounding areas",
    "uses": [
      [
        "Hospitality & leisure",
        "Assess drinking-water supply for guests, seasonal staffing and visitor facilities."
      ],
      [
        "Business continuity",
        "Consider an additional source for staff drinking-water points within a wider continuity plan."
      ],
      [
        "Rural properties",
        "Evaluate the practicalities of air intake, electrical supply and maintenance at your site."
      ]
    ]
  },
  {
    "slug": "kent-sussex",
    "name": "Kent & Sussex",
    "title": "An additional water source for Kent and Sussex",
    "description": "Explore atmospheric water generation for Kent and Sussex homes and businesses following historic supply interruptions. Speak to WatAir.",
    "intro": "Disruption to mains water can affect everyday operations. WatAir offers a way to explore local drinking-water generation as one part of a broader resilience plan.",
    "context": "Ofwat confirmed a redress package in 2026 following repeated South East Water failures and reported a further investigation into interruptions between November 2025 and January 2026. Parts of East and West Sussex were also included in the October 2026 severe drought announcement.",
    "sources": [
      {
        "label": "Ofwat: confirmed redress package and independent monitor",
        "url": "https://www.ofwat.gov.uk/ofwat-confirms-redress-package-and-independent-monitor-for-south-east-water/"
      },
      {
        "label": "Government drought announcement, 15 October 2026",
        "url": "https://www.gov.uk/government/news/government-activates-plan-to-protect-consumers-as-severe-drought-declared-in-parts-of-england"
      }
    ],
    "places": "Tunbridge Wells, Maidstone, Eastbourne, Brighton, Hastings and surrounding communities",
    "uses": [
      [
        "Homes & offices",
        "Explore compact drinking-water generation where an additional source would be useful."
      ],
      [
        "Workplace facilities",
        "Assess staff numbers, daily consumption and dispensing locations."
      ],
      [
        "Hotels & venues",
        "Plan essential drinking-water provision alongside existing continuity arrangements."
      ]
    ]
  },
  {
    "slug": "east-anglia",
    "name": "East Anglia",
    "title": "Water resilience for East Anglia businesses and homes",
    "description": "Explore on-site atmospheric water generation in East Anglia for commercial facilities, rural workplaces and homes. Request advice from WatAir.",
    "intro": "Long-term pressure on water resources makes efficient use and a diversified supply worth exploring. WatAir can help assess a complementary source for specific drinking-water needs.",
    "context": "The Environment Agency included East Anglia in its July 2026 drought announcement. Its 2025 national framework also identified future resource pressure and population growth across eastern and southern England. For businesses, the practical question is how to match an additional source to site conditions and demand.",
    "sources": [
      {
        "label": "Environment Agency drought announcement, 29 July 2026",
        "url": "https://www.gov.uk/government/news/drought-declared-in-half-of-england"
      },
      {
        "label": "National Framework for Water Resources 2025",
        "url": "https://www.gov.uk/government/publications/national-framework-for-water-resources-2025-water-for-growth-nature-and-a-resilient-future/2-current-and-future-pressures-on-water-resources-an-overview-national-framework-for-water-resources-2025"
      }
    ],
    "places": "Cambridge, Norwich, Ipswich, Bury St Edmunds and surrounding areas",
    "uses": [
      [
        "Commercial facilities",
        "Assess daily drinking-water consumption across staff and visitor areas."
      ],
      [
        "Rural workplaces",
        "Review staff welfare provision, power and maintenance access."
      ],
      [
        "Homes & offices",
        "Consider compact systems as a supplementary drinking-water source."
      ]
    ]
  }
];
const regionBySlug = slug => regions.find(region => region.slug === slug);
module.exports = { regions, regionBySlug };
