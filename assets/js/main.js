const siteHeader = document.getElementById('siteHeader');
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');

/* Page load animation */
window.addEventListener('pageshow', () => {
  document.body.classList.remove('page-exit');
  document.body.classList.add('page-loaded');
});

/* Header scroll effect */
if (siteHeader) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      siteHeader.classList.add('scrolled');
    } else {
      siteHeader.classList.remove('scrolled');
    }
  });
}

/* Mobile menu */
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener('click', () => {
    menuBtn.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    document.body.classList.toggle('menu-open');
  });

  const mobileLinks = mobileMenu.querySelectorAll('a');

  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => {
      menuBtn.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  });
}

/* Portfolio filters */
const filterButtons = document.querySelectorAll('.filter-btn');
const portfolioCards = document.querySelectorAll('.portfolio-card');

if (filterButtons.length && portfolioCards.length) {
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;

      filterButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');

      portfolioCards.forEach((card) => {
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

/* Light page transition */
const internalLinks = document.querySelectorAll(
  'a[href$=".html"], a[href="index.html"], a[href="work.html"], a[href="services.html"], a[href="contact.html"]',
);

internalLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const href = link.getAttribute('href');

    if (
      !href ||
      href.startsWith('#') ||
      link.target === '_blank' ||
      event.metaKey ||
      event.ctrlKey
    ) {
      return;
    }

    event.preventDefault();
    document.body.classList.add('page-exit');

    setTimeout(() => {
      window.location.href = href;
    }, 220);
  });
});
