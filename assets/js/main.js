document.addEventListener('DOMContentLoaded', function () {
  const siteHeader = document.getElementById('siteHeader');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const scrollToggle = document.getElementById('scrollToggle');
  const projectForm = document.getElementById('projectForm');
  const audienceTabs = document.querySelectorAll('[data-audience-tab]');
  const audiencePanels = document.querySelectorAll('[data-audience-panel]');
  const audienceJumpButtons = document.querySelectorAll('[data-audience-jump]');

  document.body.classList.remove('page-exit');
  document.body.classList.add('page-loaded');

  function restoreVisiblePage() {
    document.body.classList.remove('page-exit');
    document.body.classList.add('page-loaded');
  }

  window.addEventListener('pageshow', restoreVisiblePage);
  window.addEventListener('pagehide', function () {
    document.body.classList.remove('page-exit');
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) restoreVisiblePage();
  });

  function getScrollTop() {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function getScrollableHeight() {
    return Math.max(
      0,
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.body.clientHeight,
        document.documentElement.clientHeight,
      ) - window.innerHeight,
    );
  }

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
    if (!menuBtn || !mobileMenu) return;

    if (mobileMenu.classList.contains('active')) {
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
    window.addEventListener('scroll', updateHeader, { passive: true });
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
      const scrollPosition = getScrollTop();
      const pageHeight = getScrollableHeight();
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

    window.addEventListener('scroll', updateScrollButton, { passive: true });
    window.addEventListener('resize', updateScrollButton);

    scrollToggle.addEventListener('click', function () {
      const isGoingUp = scrollToggle.classList.contains('go-up');
      const pageHeight = getScrollableHeight();

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

  if (projectForm) {
    const projectParams = new URLSearchParams(window.location.search);
    const referralCode = projectParams.get('ref');
    const requestedType = projectParams.get('type');
    const referralInput = document.getElementById('referralCode');
    const referralNotice = document.getElementById('referralNotice');
    if (referralCode && referralInput && referralNotice) {
      referralInput.value = referralCode.slice(0, 80);
      referralNotice.hidden = false;
      referralNotice.querySelector('strong').textContent = referralInput.value;
    }
    if (requestedType) {
      const requestedRadio = projectForm.querySelector(
        `input[name="project_type"][value="${requestedType === 'music-video' ? 'Music video' : requestedType === 'business-video' ? 'Business video' : ''}"]`,
      );
      if (requestedRadio) requestedRadio.checked = true;
    }
    const steps = Array.from(projectForm.querySelectorAll('.form-step'));
    const progressItems = Array.from(
      projectForm.querySelectorAll('[data-progress]'),
    );
    const backButton = document.getElementById('stepBack');
    const nextButton = document.getElementById('stepNext');
    const submitButton = projectForm.querySelector('.step-submit');
    let currentStep = 0;

    function showStep(index) {
      currentStep = Math.max(0, Math.min(index, steps.length - 1));
      steps.forEach(function (step, stepIndex) {
        step.classList.toggle('active', stepIndex === currentStep);
      });
      progressItems.forEach(function (item, itemIndex) {
        item.classList.toggle('active', itemIndex <= currentStep);
      });
      backButton.hidden = currentStep === 0;
      nextButton.hidden = currentStep === steps.length - 1;
      submitButton.hidden = currentStep !== steps.length - 1;
      projectForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function validateCurrentStep() {
      const fields = Array.from(
        steps[currentStep].querySelectorAll('input, select, textarea'),
      );
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
      return true;
    }

    nextButton.addEventListener('click', function () {
      if (validateCurrentStep()) showStep(currentStep + 1);
    });

    backButton.addEventListener('click', function () {
      showStep(currentStep - 1);
    });

    showStep(0);
  }

  function selectAudience(audience, shouldScroll) {
    audienceTabs.forEach(function (tab) {
      const active = tab.dataset.audienceTab === audience;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    audiencePanels.forEach(function (panel) {
      panel.classList.toggle(
        'active',
        panel.dataset.audiencePanel === audience,
      );
    });
    if (shouldScroll) {
      document.getElementById('chooseService')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  audienceTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      selectAudience(tab.dataset.audienceTab, false);
    });
  });
  audienceJumpButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      audienceJumpButtons.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      selectAudience(button.dataset.audienceJump, true);
    });
  });

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
        href.startsWith('http') ||
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
