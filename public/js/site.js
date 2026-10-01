const toggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
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
  }
});

document.querySelectorAll('[data-product-jump]').forEach(select => {
  select.addEventListener('change', () => {
    if (select.value) window.location.assign(select.value);
  });
});
