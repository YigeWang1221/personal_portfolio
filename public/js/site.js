// Progressive enhancement for the portfolio (ADR-016). The only script on the site; every page works without it.
//   1. Mobile menu: the header's link row becomes a disclosure behind the "Menu" button on narrow screens.
//   2. Project filter: the ?focus= links on /projects/ filter the list in place, keeping the URL, refresh and
//      the back button in sync. An unknown value falls back to "All".
//   3. Language switch: keeps the current #section and ?focus= (both are identical across languages).
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  // 1. Mobile menu ---------------------------------------------------------------------------------------
  function initMenu() {
    var header = document.querySelector('.site-header');
    var button = header && header.querySelector('.menu-button');
    var list = button && document.getElementById(button.getAttribute('aria-controls'));
    if (!header || !button || !list) return;
    button.hidden = false;

    function setOpen(open, restoreFocus) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      header.classList.toggle('menu-open', open);
      if (!open && restoreFocus) button.focus();
    }

    button.addEventListener('click', function () {
      setOpen(button.getAttribute('aria-expanded') !== 'true', false);
    });
    header.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
        setOpen(false, true);
      }
    });
    document.addEventListener('click', function (event) {
      if (button.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) setOpen(false, false);
    });
    // Leaving the narrow layout closes the menu, so it never stays open behind the desktop row.
    var wide = window.matchMedia('(min-width: 48.001rem)');
    var onChange = function () { if (wide.matches) setOpen(false, false); };
    if (wide.addEventListener) wide.addEventListener('change', onChange);
    else if (wide.addListener) wide.addListener(onChange);
  }

  // 2. Project filter ------------------------------------------------------------------------------------
  function initFilter() {
    var catalog = document.querySelector('[data-catalog]');
    if (!catalog) return;
    var links = Array.prototype.slice.call(catalog.querySelectorAll('[data-filter]'));
    var items = Array.prototype.slice.call(catalog.querySelectorAll('.index-item'));
    var count = catalog.querySelector('[data-count]');
    var valid = links.map(function (a) { return a.getAttribute('data-filter'); }).filter(Boolean);
    var one = catalog.getAttribute('data-count-one');
    var many = catalog.getAttribute('data-count-many');

    function current() {
      var value = new URLSearchParams(window.location.search).get('focus') || '';
      return valid.indexOf(value) >= 0 ? value : '';
    }

    function apply(value) {
      var shown = 0;
      items.forEach(function (item) {
        var match = !value || (' ' + item.getAttribute('data-focus') + ' ').indexOf(' ' + value + ' ') >= 0;
        item.hidden = !match;
        if (match) shown += 1;
      });
      links.forEach(function (a) {
        if (a.getAttribute('data-filter') === value) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      if (count) count.textContent = shown === 1 ? one : many.replace('{n}', String(shown));
    }

    links.forEach(function (a) {
      a.addEventListener('click', function (event) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        var value = a.getAttribute('data-filter');
        if (value !== current()) window.history.pushState(null, '', a.getAttribute('href'));
        apply(value);
      });
    });
    window.addEventListener('popstate', function () { apply(current()); });

    // An unknown ?focus= value shows everything and is removed from the address bar.
    var requested = new URLSearchParams(window.location.search).get('focus');
    if (requested !== null && current() === '') {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
    apply(current());
  }

  // 3. Language switch -----------------------------------------------------------------------------------
  function initLanguageSwitch() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.lang-switch a'));
    if (!links.length) return;
    var bases = links.map(function (a) { return a.getAttribute('href'); });
    function update() {
      var focus = new URLSearchParams(window.location.search).get('focus');
      var query = focus && document.querySelector('[data-filter="' + focus + '"]') ? '?focus=' + encodeURIComponent(focus) : '';
      var hash = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1))) ? window.location.hash : '';
      links.forEach(function (a, i) { a.setAttribute('href', bases[i] + query + hash); });
    }
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('[data-filter], a[href^="#"]')) window.setTimeout(update, 0);
    });
    update();
  }

  function init() {
    initMenu();
    initFilter();
    initLanguageSwitch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
