// ============================
//   RouterHaus v5 – scripts.js
// ============================
"use strict";

/* ---------- Utilities ---------- */
const debounce = (fn, d = 200) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), d);
  };
};
const $$ = s => document.querySelectorAll(s);

/* ---------- Toast ---------- */
function showToast(msg, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    Object.assign(c.style, {
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      zIndex: '1100',
      display: 'flex',
      flexDirection: 'column',
      gap: '.5rem'
    });
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.textContent = msg;
  const bg = type === 'error'
    ? '#FF6B7B'
    : type === 'info'
      ? '#00CFFD'
      : '#37C978';
  Object.assign(t.style, {
    padding: '0.8rem 1.2rem',
    borderRadius: '8px',
    color: '#fff',
    background: bg,
    opacity: '0',
    transform: 'translateY(10px)',
    transition: 'all .3s ease'
  });
  c.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    t.style.opacity = '0';
    t.addEventListener('transitionend', () => t.remove());
  }, 3400);
}

/* ---------- Partials ---------- */
async function loadPartials() {
  const headHolder = document.getElementById('header-placeholder');
  if (headHolder) {
    const h = await fetch('header.html');
    headHolder.outerHTML = await h.text();
  }
  const footHolder = document.getElementById('footer-placeholder');
  if (footHolder) {
    const f = await fetch('footer.html');
    footHolder.outerHTML = await f.text();
  }
}

function initUI() {
  const header     = document.querySelector('.navbar'),
        hamburger  = document.getElementById('hamburger-menu'),
        sidebar    = document.getElementById('sidebar'),
        overlay    = document.getElementById('sidebar-overlay'),
        themeToggle = document.getElementById('theme-toggle');

  /* Sticky header fade */
  window.addEventListener('scroll', debounce(() => {
    header.style.backdropFilter = window.scrollY > 50 ? 'blur(26px)' : 'blur(0px)';
  }, 60));

  /* Sidebar */
  const toggleSidebar = () => {
    const open = sidebar.classList.toggle('active');
    hamburger.classList.toggle('active');
    overlay.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', open);
    sidebar.setAttribute('aria-hidden', !open);
  };
  hamburger.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', toggleSidebar);

  /* Smooth scroll */
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (sidebar.classList.contains('active')) toggleSidebar();
      }
    });
  });

  /* Accordion */
  $$('.accordion-item').forEach(item =>
    item.addEventListener('click', () => item.classList.toggle('open'))
  );

  /* Theme toggle */
  const applyTheme = isDark => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('rh-theme', isDark ? 'dark' : 'light');
    themeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    showToast(isDark ? 'Dark mode on' : 'Light mode on', 'info');
  };

  const saved = localStorage.getItem('rh-theme');
  const pref = saved ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(pref === 'dark');

  themeToggle.addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme !== 'dark')
  );
}

/* ---------- DOM Ready ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadPartials();
  initUI();
});
