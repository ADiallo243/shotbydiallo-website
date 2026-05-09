document.addEventListener('DOMContentLoaded', function () {
  const siteHeader = document.getElementById('siteHeader');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const scrollToggle = document.getElementById('scrollToggle');

  document.body.classList.remove('page-exit');
  document.body.classList.add('page-loaded');

  function closeMenu() {
    if (!menuBtn || !mobileMenu) return;

    menuBtn.classList.remove('active');
    mobileMenu.classList.remove('active');
    document.body.classList.remove('menu-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
  }

  function openMenu() {
    if (!menuBtn || !mobileMenu) return;

    menuBtn.classList.add('active');
    mobileMenu.classList.add('active');
    document.body.classList.add('menu-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
  }

  function toggleMenu() {
    if (!mobileMenu || !menuBtn) return;

    const isOpen = mobileMenu.classList.contains('active');

    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  if (siteHeader) {
    function updateHeader() {
      if (window.scrollY > 30) {
        siteHeader.classList.add('scrolled');
      } else {
        siteHeader.classList.remove('scrolled');
      }
    }

    updateHeader();
    window.addEventListener('scroll', updateHeader);
  }

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });

    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) {
        closeMenu();
      }
    });
  }

  const filterButtons = document.querySelectorAll('.filter-btn');
  const portfolioCards = document.querySelectorAll('.portfolio-card');

  if (filterButtons.length && portfolioCards.length) {
    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const filter = button.dataset.filter;

        filterButtons.forEach(function (btn) {
          btn.classList.remove('active');
        });

        button.classList.add('active');

        portfolioCards.forEach(function (card) {
          const category = card.dataset.category;

          if (filter === 'all' || category === filter) {
            card.classList.remove('hide');
          } else {
            card.classList.add('hide');
          }
        });
      });
    });
  }

  if (scrollToggle) {
    function updateScrollButton() {
      const scrollPosition = window.scrollY;
      const pageHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const switchPoint = pageHeight * 0.35;

      if (scrollPosition > switchPoint) {
        scrollToggle.classList.add('go-up');
        scrollToggle.setAttribute('aria-label', 'Scroll to top');
      } else {
        scrollToggle.classList.remove('go-up');
        scrollToggle.setAttribute('aria-label', 'Scroll down');
      }
    }

    updateScrollButton();
    window.addEventListener('scroll', updateScrollButton);

    scrollToggle.addEventListener('click', function () {
      const isGoingUp = scrollToggle.classList.contains('go-up');
      const pageHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      if (isGoingUp) {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      } else {
        window.scrollTo({
          top: Math.min(window.innerHeight * 0.92, pageHeight),
          behavior: 'smooth',
        });
      }
    });
  }

  const internalLinks = document.querySelectorAll(
    'a[href="index.html"], a[href="work.html"], a[href="services.html"], a[href="contact.html"], a[href$=".html"]',
  );

  internalLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      const href = link.getAttribute('href');

      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        link.target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      closeMenu();
      document.body.classList.add('page-exit');

      setTimeout(function () {
        window.location.href = href;
      }, 160);
    });
  });
});
