const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

if (toggle && nav) {
  const setMenuState = open => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    document.documentElement.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-open', open);
    if (!open) closeGroups();
  };

  toggle.addEventListener('click', () => {
    setMenuState(!nav.classList.contains('open'));
  });

  nav.addEventListener('click', event => {
    if (window.innerWidth > 900) return;
    const link = event.target.closest('a');
    if (link) setMenuState(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && nav.classList.contains('open')) setMenuState(false);
  });
}

const header = document.querySelector('[data-header]');
if (header) {
  const update = () => header.classList.toggle('scrolled', window.scrollY > 10);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

const navGroups = [...document.querySelectorAll('[data-nav-group]')];
const closeGroups = except => {
  navGroups.forEach(group => {
    if (group === except) return;
    group.classList.remove('dropdown-open');
    const button = group.querySelector('[data-nav-trigger]');
    if (button) button.setAttribute('aria-expanded', 'false');
  });
};

navGroups.forEach(group => {
  const trigger = group.querySelector('[data-nav-trigger]');
  if (!trigger) return;

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    const opening = !group.classList.contains('dropdown-open');
    closeGroups(group);
    group.classList.toggle('dropdown-open', opening);
    trigger.setAttribute('aria-expanded', String(opening));
  });
});

document.addEventListener('click', event => {
  if (!event.target.closest('[data-nav-group]')) closeGroups();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeGroups();
    nav?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
    document.documentElement.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
  }
});

document.querySelectorAll('[data-product-jump]').forEach(select => {
  select.addEventListener('change', () => {
    if (select.value) window.location.assign(select.value);
  });
});


/* Progressive section entrances — deliberately subtle and disabled for reduced motion. */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('motion-ready');

  const revealTargets = [
    ...document.querySelectorAll('main > section:not(.hero):not(.product-hero):not(.page-hero):not(.product-catalogue)'),
    ...document.querySelectorAll('.process-grid > div, .application-grid article, .metric-band > div, .faq-group, .resource-card, .page-side-card')
  ];

  const uniqueTargets = [...new Set(revealTargets)];
  uniqueTargets.forEach((el, index) => {
    el.classList.add('reveal-item');
    el.style.setProperty('--reveal-delay', `${Math.min(index % 5, 4) * 55}ms`);
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.08
  });

  uniqueTargets.forEach(el => observer.observe(el));

  const hero = document.querySelector('.hero, .product-hero, .page-hero, .contact-modern');
  if (hero) {
    hero.classList.add('hero-enter');
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-visible')));
  }
}
