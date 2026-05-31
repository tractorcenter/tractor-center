(function () {
  var modal = document.querySelector('[data-search-modal]');
  var openBtn = document.querySelector('[data-search-open]');
  var closeBtns = document.querySelectorAll('[data-search-close]');
  var input = document.querySelector('[data-search-input]');
  var results = document.querySelector('[data-search-results]');

  function openModal() {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    if (input) input.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  if (openBtn) {
    openBtn.addEventListener('click', openModal);
  }
  closeBtns.forEach(function (btn) {
    btn.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  function renderItems(items) {
    if (!results) return;
    if (!items || items.length === 0) {
      results.innerHTML = '<p class="muted">No results yet.</p>';
      return;
    }
    var html = '<ul>';
    items.forEach(function (item) {
      html += '<li><a href="' + item.path + '">' + item.title + '</a>';
      if (item.snippet) html += '<p class="muted">' + item.snippet + '</p>';
      html += '</li>';
    });
    html += '</ul>';
    results.innerHTML = html;
  }

  function fetchStaticIndex(query) {
    return fetch('/search.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var q = query.toLowerCase();
        var items = (data.items || []).filter(function (item) {
          return (item.title || '').toLowerCase().includes(q) ||
            (item.snippet || '').toLowerCase().includes(q);
        }).slice(0, 10);
        renderItems(items);
      });
  }

  function fetchServer(query) {
    return fetch('/v1/search?q=' + encodeURIComponent(query))
      .then(function (res) { return res.json(); })
      .then(function (data) { renderItems(data.items || []); });
  }

  function wireSearchInput() {
    if (!input) return;
    var timeout;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2) {
        renderItems([]);
        return;
      }
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        if (window.__notepubSearchMode === 'static') {
          fetchStaticIndex(q);
        } else {
          fetchServer(q);
        }
      }, 200);
    });
  }

  function fitServiceHeroTitles() {
    var titles = document.querySelectorAll('.service-hero h1');
    if (!titles.length) return;
    titles.forEach(function (el) {
      var max = 52;
      var min = 36;
      var size = max;
      el.style.fontSize = size + 'px';
      el.style.overflowWrap = 'normal';
      el.style.wordBreak = 'normal';
      while (el.scrollWidth > el.clientWidth && size > min) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  function wireGalleryLightbox() {
    var items = document.querySelectorAll('.gallery-item');
    if (!items.length) return;

    var overlay = document.createElement('div');
    overlay.className = 'gallery-lightbox';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<img alt=\"\" />';
    document.body.appendChild(overlay);
    var image = overlay.querySelector('img');

    function close() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      image.removeAttribute('src');
      image.removeAttribute('alt');
    }

    items.forEach(function (item) {
      item.addEventListener('click', function () {
        var src = item.getAttribute('data-gallery-src');
        var img = item.querySelector('img');
        if (!src) return;
        image.src = src;
        image.alt = img ? img.alt : '';
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
      });
    });

    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  function wirePartnersCarousel() {
    var carousels = document.querySelectorAll('[data-partners-carousel]');
    if (!carousels.length) return;

    carousels.forEach(function (carousel) {
      var track = carousel.querySelector('.partners-track');
      if (!track) return;
      var items = Array.prototype.slice.call(track.children);
      if (!items.length) return;

      items.forEach(function (item) {
        track.appendChild(item.cloneNode(true));
      });

      var speed = 36; // px/sec
      var pausedUntil = 0;
      var last = 0;

      function pause(ms) {
        pausedUntil = Date.now() + ms;
      }

      carousel.addEventListener('mouseenter', function () { pause(100000); });
      carousel.addEventListener('mouseleave', function () { pause(600); });
      carousel.addEventListener('touchstart', function () { pause(1500); }, { passive: true });

      function tick(ts) {
        if (!last) last = ts;
        var dt = ts - last;
        last = ts;

        if (Date.now() > pausedUntil) {
          carousel.scrollLeft += (speed * dt) / 1000;
          var half = track.scrollWidth / 2;
          if (carousel.scrollLeft >= half) {
            carousel.scrollLeft = 0;
          }
        }
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  wireSearchInput();
  fitServiceHeroTitles();
  wireGalleryLightbox();
  wirePartnersCarousel();
  window.addEventListener('resize', fitServiceHeroTitles);
})();
