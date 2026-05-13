// ─── 0colors marketing site — light interactivity ───
// All features are progressive: the page is fully usable with JS off.

(() => {
  'use strict';

  // ─── 1. Sticky nav backdrop on scroll ───
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ─── 2. Fade-in on scroll (one-shot) ───
  // Pattern: page renders fully visible without JS. JS opt-in animation:
  //   1) hide elements that are still BELOW the viewport (add .pre-fade)
  //   2) leave elements already in view alone (they stay visible)
  //   3) observer reveals .pre-fade elements as they scroll in
  const fades = document.querySelectorAll('.fade-in');
  const vh = window.innerHeight || 900;
  fades.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top >= vh) {
      el.classList.add('pre-fade');
    } else {
      el.classList.add('is-visible');
    }
  });

  if ('IntersectionObserver' in window && fades.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.remove('pre-fade');
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    fades.forEach((el) => {
      if (el.classList.contains('pre-fade')) io.observe(el);
    });
  } else {
    fades.forEach((el) => { el.classList.remove('pre-fade'); el.classList.add('is-visible'); });
  }

  // ─── 3. Code-block tab switching ───
  const tabs = document.querySelectorAll('.code-tab');
  const panes = document.querySelectorAll('.code-pane');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      panes.forEach((p) => {
        const id = p.id.replace('code-', '');
        if (id === target) {
          p.hidden = false;
          p.dataset.active = '';
        } else {
          p.hidden = true;
          delete p.dataset.active;
        }
      });
    });
  });

  // ─── 4. Copy code to clipboard ───
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const active = document.querySelector('.code-pane[data-active]');
      if (!active) return;
      const text = active.innerText.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      copyBtn.classList.add('is-copied');
      const label = copyBtn.querySelector('.copy-label');
      const original = label ? label.textContent : 'Copy';
      if (label) label.textContent = 'Copied';
      setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        if (label) label.textContent = original;
      }, 1600);
    });
  }

  // ─── 5. Smooth scroll for in-page nav links ───
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
