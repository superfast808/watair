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
  update(); window.addEventListener('scroll', update, { passive: true });
}
