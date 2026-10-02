const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

if (toggle && nav) {
  const setMenuState = open => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    const label = toggle.querySelector('.menu-toggle-label');
    if (label) label.textContent = open ? 'Close' : 'Menu';
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
    const menuWasOpen = Boolean(nav?.classList.contains('open'));
    closeGroups();
    nav?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
    const label = toggle?.querySelector('.menu-toggle-label');
    if (label) label.textContent = 'Menu';
    document.documentElement.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
    if (menuWasOpen) toggle?.focus();
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


/* FAQ search */
const faqSearch = document.querySelector('[data-faq-search]');
if (faqSearch) {
  const items = [...document.querySelectorAll('[data-faq-item]')];
  const groups = [...document.querySelectorAll('[data-faq-group]')];
  const status = document.querySelector('[data-faq-status]');

  const updateFaqs = () => {
    const query = faqSearch.value.trim().toLowerCase();
    let matches = 0;

    items.forEach(item => {
      const visible = !query || (item.dataset.faqText || '').includes(query);
      item.hidden = !visible;
      if (visible) {
        matches++;
        if (query) item.open = true;
      }
    });

    groups.forEach(group => {
      group.hidden = ![...group.querySelectorAll('[data-faq-item]')].some(item => !item.hidden);
    });

    if (status) {
      status.textContent = query
        ? `${matches} ${matches === 1 ? 'answer' : 'answers'} found`
        : '';
    }
  };

  faqSearch.addEventListener('input', updateFaqs);
}

/* Commercial capacity filter */
const capacityButtons = [...document.querySelectorAll('[data-capacity-filter]')];
if (capacityButtons.length) {
  const cards = [...document.querySelectorAll('[data-product-card]')];
  const count = document.querySelector('[data-capacity-count]');

  const matchesRange = (capacity, range) => {
    if (range === 'all') return true;
    if (range === '80-250') return capacity >= 80 && capacity <= 250;
    if (range === '500-2000') return capacity >= 500 && capacity <= 2000;
    if (range === '3000-plus') return capacity >= 3000;
    return true;
  };

  capacityButtons.forEach(button => {
    button.addEventListener('click', () => {
      const range = button.dataset.capacityFilter;
      let visible = 0;

      capacityButtons.forEach(item => {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      cards.forEach(card => {
        const show = matchesRange(Number(card.dataset.capacity || 0), range);
        card.hidden = !show;
        if (show) visible++;
      });

      if (count) count.textContent = `${visible} ${visible === 1 ? 'model' : 'models'}`;
    });
  });
}

/* Cookie consent */
(() => {
  const storageKey = 'watair_cookie_consent_v1';
  const banner = document.querySelector('[data-cookie-consent]');
  const preferences = document.querySelector('[data-cookie-preferences]');
  if (!banner || !preferences) return;

  const analytics = preferences.querySelector('[data-cookie-analytics]');
  const marketing = preferences.querySelector('[data-cookie-marketing]');
  const readChoice = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };
  const applyChoice = choice => {
    window.dispatchEvent(new CustomEvent('watair:consent', { detail: choice }));
  };
  const saveChoice = choice => {
    const value = {
      essential: true,
      analytics: Boolean(choice.analytics),
      marketing: Boolean(choice.marketing),
      updated_at: new Date().toISOString()
    };
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
    banner.hidden = true;
    preferences.hidden = true;
    document.body.classList.remove('cookie-preferences-open');
    applyChoice(value);
  };
  const openPreferences = () => {
    const current = readChoice() || { analytics: false, marketing: false };
    if (analytics) analytics.checked = Boolean(current.analytics);
    if (marketing) marketing.checked = Boolean(current.marketing);
    preferences.hidden = false;
    document.body.classList.add('cookie-preferences-open');
    preferences.querySelector('.cookie-close')?.focus();
  };
  const closePreferences = () => {
    preferences.hidden = true;
    document.body.classList.remove('cookie-preferences-open');
  };

  const existing = readChoice();
  if (existing) applyChoice(existing);
  else banner.hidden = false;

  document.querySelectorAll('[data-cookie-settings],[data-cookie-manage]').forEach(button => {
    button.addEventListener('click', openPreferences);
  });
  document.querySelectorAll('[data-cookie-close]').forEach(button => {
    button.addEventListener('click', closePreferences);
  });
  document.querySelectorAll('[data-cookie-reject]').forEach(button => {
    button.addEventListener('click', () => saveChoice({ analytics: false, marketing: false }));
  });
  document.querySelector('[data-cookie-accept]')?.addEventListener('click', () => {
    saveChoice({ analytics: true, marketing: true });
  });
  document.querySelector('[data-cookie-save]')?.addEventListener('click', () => {
    saveChoice({ analytics: analytics?.checked, marketing: marketing?.checked });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !preferences.hidden) closePreferences();
  });
})();

/* Checkout delivery quote */
(() => {
  const form = document.querySelector('[data-checkout-form]');
  const summary = document.querySelector('[data-checkout-summary]');
  if (!form || !summary) return;

  const postcode = form.querySelector('[data-checkout-postcode]');
  const country = form.querySelector('[data-checkout-country]');
  const quantity = form.querySelector('[data-checkout-quantity]');
  const deliveryStatus = form.querySelector('[data-delivery-status]');
  const deliveryPrice = summary.querySelector('[data-delivery-price]');
  const total = summary.querySelector('[data-checkout-total]');
  const submit = form.querySelector('.checkout-submit');
  const slug = form.dataset.productSlug;
  let timer = null;
  let controller = null;

  const setUnavailable = message => {
    if (deliveryStatus) deliveryStatus.textContent = message;
    if (deliveryPrice) deliveryPrice.textContent = 'Not available';
    if (submit) submit.disabled = true;
  };

  const quote = async () => {
    const postal = postcode?.value.trim() || '';
    const countryCode = country?.value || '';
    if (!postal || !countryCode) {
      setUnavailable('Enter a postcode to calculate delivery.');
      return;
    }

    controller?.abort();
    controller = new AbortController();
    if (deliveryStatus) deliveryStatus.textContent = 'Calculating delivery…';
    if (submit) submit.disabled = true;

    try {
      const response = await fetch('/checkout/quote/' + encodeURIComponent(slug), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postcode: postal,
          country_code: countryCode,
          quantity: Number(quantity?.value || 1)
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Delivery could not be calculated.');
      if (deliveryPrice) deliveryPrice.textContent = payload.delivery_formatted;
      if (total) total.textContent = payload.total_formatted;
      if (deliveryStatus) deliveryStatus.textContent = payload.delivery_label + ' · ' + payload.delivery_formatted;
      if (submit) submit.disabled = false;
    } catch (err) {
      if (err.name === 'AbortError') return;
      setUnavailable(err.message || 'Delivery could not be calculated.');
    }
  };

  const scheduleQuote = () => {
    clearTimeout(timer);
    timer = setTimeout(quote, 320);
  };
  postcode?.addEventListener('input', scheduleQuote);
  country?.addEventListener('change', quote);
  quantity?.addEventListener('change', quote);

  if (postcode?.value.trim()) quote();
  else if (submit) submit.disabled = true;
})();

