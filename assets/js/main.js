document.addEventListener('DOMContentLoaded', function () {
  const siteHeader = document.getElementById('siteHeader');
  const menuBtn = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const scrollToggle = document.getElementById('scrollToggle');
  const projectForm = document.getElementById('projectForm');
  const audienceTabs = document.querySelectorAll('[data-audience-tab]');
  const audiencePanels = document.querySelectorAll('[data-audience-panel]');
  const audienceJumpButtons = document.querySelectorAll('[data-audience-jump]');

  function trackEvent(name, parameters) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, parameters || {});
  }

  document.body.classList.remove('page-exit');
  document.body.classList.add('page-loaded');

  async function loadManagedMedia() {
    if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
    const placements = {
      'assets/images/hero/hero-launch.jpg': 'home-hero-poster',
      'assets/videos/hero-video.mp4': 'home-hero-video',
      'assets/videos/artist-reel.mp4': 'work-featured-video',
      'assets/images/work/music-video-web.jpg': 'music-video-cover',
      'assets/images/work/brand-video-web.jpg': 'business-video-cover',
      'assets/images/work/event-video-web.jpg': 'event-video-cover',
      'assets/images/work/wedding-video-web.jpg': 'wedding-video-cover',
      'assets/images/work/streetwear-brand-optimized.jpg': 'streetwear-cover',
      'assets/images/work/creative-portrait-optimized.jpg': 'portrait-cover',
      'assets/images/work/cultural-event-optimized.jpg': 'culture-cover',
      'assets/images/work/lifestyle-brand-optimized.jpg': 'lifestyle-cover',
      'assets/images/about/portrait-optimized.jpg': 'about-portrait',
    };
    try {
      const configResponse = await fetch('/api/crm-config');
      if (!configResponse.ok) return;
      const config = await configResponse.json();
      const mediaResponse = await fetch(
        `${config.url}/rest/v1/media_assets?select=storage_path,website_placement,alt_text,media_type&website_placement=not.is.null`,
        { headers: { apikey: config.key } },
      );
      if (!mediaResponse.ok) return;
      const assets = await mediaResponse.json();
      const byPlacement = new Map(assets.map((asset) => [asset.website_placement, asset]));
      document.querySelectorAll('img,video,source').forEach(function (element) {
        const source = element.getAttribute('src') || element.getAttribute('poster') || element.dataset.src;
        const placement = placements[source];
        const asset = placement && byPlacement.get(placement);
        if (!asset) return;
        const publicUrl = `${config.url}/storage/v1/object/public/site-media/${asset.storage_path}`;
        if (element.tagName === 'VIDEO') element.poster = publicUrl;
        else if (element.tagName === 'SOURCE' && element.dataset.src) element.dataset.src = publicUrl;
        else element.src = publicUrl;
        if (element.tagName === 'IMG' && asset.alt_text) element.alt = asset.alt_text;
      });
    } catch {
      // The static, optimized website assets remain available if managed media is unavailable.
    }
  }

  function startDeferredVideos() {
    if (navigator.connection?.saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    document.querySelectorAll('video source[data-src]').forEach(function (source) {
      if (source.src) return;
      source.src = source.dataset.src;
      const video = source.closest('video');
      video?.load();
      video?.play().catch(function () {});
    });
  }

  function scheduleDeferredVideos() {
    let started = false;
    const startOnce = function () {
      if (started) return;
      started = true;
      startDeferredVideos();
      ['pointerdown', 'keydown', 'scroll'].forEach((eventName) => window.removeEventListener(eventName, startOnce));
    };
    ['pointerdown', 'keydown', 'scroll'].forEach((eventName) => window.addEventListener(eventName, startOnce, { passive: true, once: true }));
  }

  loadManagedMedia().finally(scheduleDeferredVideos);

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
    mobileMenu.setAttribute('aria-hidden', 'true');
  }

  function openMenu() {
    if (!menuBtn || !mobileMenu) return;

    menuBtn.classList.add('active');
    mobileMenu.classList.add('active');
    document.body.classList.add('menu-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
    mobileMenu.setAttribute('aria-hidden', 'false');
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
    mobileMenu.setAttribute('aria-hidden', 'true');

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
          btn.setAttribute('aria-pressed', 'false');
        });

        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        trackEvent('select_content', {
          content_type: 'portfolio_filter',
          item_id: filter,
        });

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
    const formStatus = document.getElementById('projectFormStatus');
    let currentStep = 0;

    function setFormStatus(message, tone) {
      if (!formStatus) return;
      formStatus.textContent = message;
      formStatus.dataset.tone = tone || 'success';
      formStatus.hidden = !message;
    }

    function showStep(index, shouldScroll) {
      currentStep = Math.max(0, Math.min(index, steps.length - 1));
      steps.forEach(function (step, stepIndex) {
        step.classList.toggle('active', stepIndex === currentStep);
      });
      progressItems.forEach(function (item, itemIndex) {
        item.classList.toggle('active', itemIndex <= currentStep);
        if (itemIndex === currentStep) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
      steps.forEach(function (step, stepIndex) {
        step.setAttribute('aria-hidden', String(stepIndex !== currentStep));
      });
      backButton.hidden = currentStep === 0;
      nextButton.hidden = currentStep === steps.length - 1;
      submitButton.hidden = currentStep !== steps.length - 1;
      if (shouldScroll) {
        projectForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
      if (validateCurrentStep()) {
        if (currentStep === 0) {
          trackEvent('form_start', { form_id: 'project_request' });
        }
        showStep(currentStep + 1, true);
      }
    });

    backButton.addEventListener('click', function () {
      showStep(currentStep - 1, true);
    });

    projectForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!projectForm.checkValidity()) return;

      submitButton.disabled = true;
      submitButton.textContent = 'Sending…';
      setFormStatus('');

      try {
        const response = await fetch(projectForm.action, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(Object.fromEntries(new FormData(projectForm))),
        });
        const result = await response.json().catch(function () {
          return {};
        });

        if (!response.ok) {
          throw new Error(result.error || 'Unable to send your request.');
        }

        const submittedData = Object.fromEntries(new FormData(projectForm));
        trackEvent('generate_lead', {
          form_id: 'project_request',
          project_type: submittedData.project_type || 'unknown',
          lead_source: submittedData.lead_source || 'unknown',
          contact_preference: submittedData.contact_preference || 'Email',
        });
        projectForm.reset();
        showStep(0, false);
        setFormStatus(
          'Thanks — your project request was received. ShotByDiallo will be in touch shortly.',
        );
      } catch (error) {
        setFormStatus(
          error.message || 'Something went wrong. Please email shotbydiallo@gmail.com instead.',
          'error',
        );
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Project Request';
      }
    });

    showStep(0, false);
  }

  function selectAudience(audience, shouldScroll) {
    audienceTabs.forEach(function (tab) {
      const active = tab.dataset.audienceTab === audience;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    audiencePanels.forEach(function (panel) {
      const active = panel.dataset.audiencePanel === audience;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    audienceJumpButtons.forEach(function (button) {
      button.classList.toggle('active', button.dataset.audienceJump === audience);
      button.setAttribute('aria-pressed', String(button.dataset.audienceJump === audience));
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
      trackEvent('select_content', {
        content_type: 'service_audience',
        item_id: tab.dataset.audienceTab,
      });
    });
    tab.addEventListener('keydown', function (event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = Array.from(audienceTabs);
      const currentIndex = tabs.indexOf(tab);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      selectAudience(tabs[nextIndex].dataset.audienceTab, false);
    });
  });
  audienceJumpButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectAudience(button.dataset.audienceJump, true);
      trackEvent('select_content', {
        content_type: 'hero_service_path',
        item_id: button.dataset.audienceJump,
      });
    });
  });

  if (audienceTabs.length) {
    const selectedTab = Array.from(audienceTabs).find(function (tab) {
      return tab.getAttribute('aria-selected') === 'true';
    });
    selectAudience(selectedTab?.dataset.audienceTab || 'artist', false);
  }

  document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]').forEach(function (link) {
    link.addEventListener('click', function () {
      const method = link.getAttribute('href').startsWith('tel:') ? 'phone' : 'email';
      trackEvent('contact', { method: method });
    });
  });

  const internalLinks = document.querySelectorAll(
    'a[href="/"], a[href="/work"], a[href="/services"], a[href="/contact"]',
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
