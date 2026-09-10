document.addEventListener('DOMContentLoaded', function () {
  const isFrench = document.documentElement.lang.toLowerCase().startsWith('fr');
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
      'assets/videos/cyberxis-afro-foudre-preview.mp4': 'cyberxis-afro-foudre-preview',
      'assets/images/work/cyberxis-afro-foudre-poster.jpg': 'cyberxis-afro-foudre-cover',
      'assets/videos/oseibou-collection-preview.mp4': 'oseibou-collection-preview',
      'assets/images/work/oseibou-collection-poster.jpg': 'oseibou-collection-cover',
      'assets/videos/voice-of-guinea-conakry-raconte-preview.mp4': 'voice-of-guinea-conakry-raconte-preview',
      'assets/images/work/voice-of-guinea-conakry-raconte-poster.jpg': 'voice-of-guinea-conakry-raconte-cover',
      'assets/videos/liprobakin-all-star-games-preview.mp4': 'liprobakin-all-star-games-preview',
      'assets/images/work/liprobakin-all-star-games-poster.jpg': 'liprobakin-all-star-games-cover',
      'assets/videos/young-gielo-release-visualizer-preview.mp4': 'young-gielo-release-visualizer-preview',
      'assets/images/work/young-gielo-release-visualizer-poster.jpg': 'young-gielo-release-visualizer-cover',
      'assets/videos/behind-the-scenes-preview.mp4': 'behind-the-scenes-preview',
      'assets/images/about/behind-the-scenes-poster.jpg': 'behind-the-scenes-cover',
      'assets/videos/diaspora-brand-campaign-preview.mp4': 'diaspora-brand-campaign-preview',
      'assets/images/work/diaspora-brand-campaign-poster.jpg': 'diaspora-brand-campaign-cover',
      'assets/videos/fusion-entertainment-keblack-preview.mp4': 'fusion-entertainment-keblack-preview',
      'assets/images/work/fusion-entertainment-keblack-poster.jpg': 'fusion-entertainment-keblack-cover',
      'assets/videos/zeusdiallo-short-form-preview.mp4': 'zeusdiallo-short-form-preview',
      'assets/images/work/zeusdiallo-short-form-poster.jpg': 'zeusdiallo-short-form-cover',
      'assets/videos/bilouki-showcase-recap-preview.mp4': 'bilouki-showcase-recap-preview',
      'assets/images/work/bilouki-showcase-recap-poster.jpg': 'bilouki-showcase-recap-cover',
      'assets/videos/yami-conakry-visualizer-preview.mp4': 'yami-conakry-visualizer-preview',
      'assets/images/work/yami-conakry-visualizer-poster.jpg': 'yami-conakry-visualizer-cover',
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
        const normalizedSource = source && source.replace(/^\/+/, '');
        const placement = placements[normalizedSource];
        const asset = placement && byPlacement.get(placement);
        if (!asset) return;
        const publicUrl = `${config.url}/storage/v1/object/public/site-media/${asset.storage_path}`;
        if (element.tagName === 'VIDEO') {
          element.poster = publicUrl;
        } else if (element.tagName === 'SOURCE') {
          if (element.dataset.src) element.dataset.src = publicUrl;
          else element.src = publicUrl;
          const video = element.closest('video');
          if (video && !element.dataset.src) {
            video.load();
            if (video.autoplay) video.play().catch(function () {});
          }
        } else {
          element.src = publicUrl;
        }
        if (element.tagName === 'IMG' && asset.alt_text) element.alt = asset.alt_text;
      });
    } catch {
      // The static, optimized website assets remain available if managed media is unavailable.
    }
  }

  function canLoadDeferredVideos() {
    return !navigator.connection?.saveData
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function loadDeferredVideo(video) {
    if (!video || video.dataset.mediaLoaded === 'true') return;
    const sources = video.querySelectorAll('source[data-src]');
    if (!sources.length) return;
    sources.forEach(function (source) {
      source.src = source.dataset.src;
    });
    video.dataset.mediaLoaded = 'true';
    video.load();
    if (video.autoplay) video.play().catch(function () {});
  }

  function startDeferredVideos() {
    if (!canLoadDeferredVideos()) return;
    const videos = Array.from(new Set(
      Array.from(document.querySelectorAll('video source[data-src]')).map(function (source) {
        return source.closest('video');
      }).filter(Boolean),
    ));
    if (!('IntersectionObserver' in window)) {
      videos.forEach(loadDeferredVideo);
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          loadDeferredVideo(entry.target);
          if (entry.target.autoplay) entry.target.play().catch(function () {});
        } else if (!entry.target.paused) {
          entry.target.pause();
        }
      });
    }, { rootMargin: '320px 0px' });
    videos.forEach(function (video) {
      observer.observe(video);
    });
  }

  function scheduleDeferredVideos() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(startDeferredVideos, { timeout: 1200 });
    } else {
      window.setTimeout(startDeferredVideos, 250);
    }
  }

  function initializeVideoSoundControls() {
    const pagePath = window.location.pathname.replace(/\/+$/, '') || '/';
    const supportsSoundControls = pagePath === '/'
      || pagePath === '/index.html'
      || pagePath === '/fr'
      || pagePath === '/work'
      || pagePath === '/work.html'
      || pagePath === '/fr/realisations';
    if (!supportsSoundControls) return;

    const autoplayVideos = Array.from(document.querySelectorAll('video[autoplay]')).filter(function (video) {
      return !video.closest('.hero');
    });
    const audioHosts = [
      '.audience-video-card',
      '.work-card',
      '.portfolio-card',
      '.about-image',
    ].join(',');

    function controlCopy(video) {
      if (video.muted) {
        return {
          label: isFrench ? 'Activer le son' : 'Turn sound on',
        };
      }
      return {
        label: isFrench ? 'Couper le son' : 'Mute video',
      };
    }

    function updateControl(control, video) {
      const copy = controlCopy(video);
      control.setAttribute('aria-label', copy.label);
      control.setAttribute('title', copy.label);
      control.classList.toggle('is-audible', !video.muted);
      control.innerHTML = video.muted
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 9 5 6m0-6-5 6"/></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a6 6 0 0 1 0 8m2.5-10.5a9.5 9.5 0 0 1 0 13"/></svg>';
    }

    function toggleSound(video, control) {
      if (video.muted) {
        autoplayVideos.forEach(function (otherVideo) {
          if (otherVideo === video) return;
          otherVideo.muted = true;
          otherVideo.defaultMuted = true;
          otherVideo.setAttribute('muted', '');
          const otherControl = document.querySelector(`[data-video-sound-for="${otherVideo.dataset.soundId}"]`);
          if (otherControl) updateControl(otherControl, otherVideo);
        });
      }
      video.muted = !video.muted;
      video.defaultMuted = video.muted;
      if (video.muted) {
        video.setAttribute('muted', '');
      } else {
        video.removeAttribute('muted');
        video.volume = 1;
        video.play().catch(function () {});
      }
      updateControl(control, video);
      trackEvent('video_audio_toggle', {
        state: video.muted ? 'muted' : 'audible',
        video: video.currentSrc || video.querySelector('source')?.dataset.src || 'unknown',
      });
    }

    autoplayVideos.forEach(function (video, index) {
      const host = video.closest(audioHosts);
      if (!host || host.querySelector(':scope > .video-sound-toggle')) return;

      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      video.dataset.soundId = `video-${index + 1}`;
      host.classList.add('video-audio-host');

      const control = document.createElement('div');
      control.className = 'video-sound-toggle';
      control.setAttribute('role', 'button');
      control.tabIndex = 0;
      control.dataset.videoSoundFor = video.dataset.soundId;
      updateControl(control, video);
      control.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleSound(video, control);
      });
      control.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        toggleSound(video, control);
      });
      host.appendChild(control);
    });
  }

  initializeVideoSoundControls();
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

  function closeMenu() {
    if (!menuBtn || !mobileMenu) return;

    menuBtn.classList.remove('active');
    mobileMenu.classList.remove('active');
    document.body.classList.remove('menu-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', isFrench ? 'Ouvrir le menu' : 'Open menu');
    mobileMenu.setAttribute('aria-hidden', 'true');
  }

  function openMenu() {
    if (!menuBtn || !mobileMenu) return;

    menuBtn.classList.add('active');
    mobileMenu.classList.add('active');
    document.body.classList.add('menu-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', isFrench ? 'Fermer le menu' : 'Close menu');
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
  const portfolioCards = document.querySelectorAll('.portfolio-section .portfolio-card');

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

  document.querySelectorAll('.case-study-frame, .case-study-gallery figure, .costume-project-still').forEach(function (mediaFigure) {
    const image = mediaFigure.querySelector('img');
    if (!image) return;
    mediaFigure.dataset.mediaPreview = '';
    mediaFigure.tabIndex = 0;
    mediaFigure.setAttribute('role', 'button');
    mediaFigure.setAttribute(
      'aria-label',
      isFrench ? `Agrandir l’image : ${image.alt}` : `Enlarge image: ${image.alt}`,
    );
  });

  const mediaPreviewTriggers = document.querySelectorAll('[data-media-preview]');

  if (mediaPreviewTriggers.length) {
    const mediaDialog = document.createElement('dialog');
    const mediaDialogInner = document.createElement('div');
    const mediaDialogStage = document.createElement('div');
    const mediaDialogTitle = document.createElement('p');
    const mediaDialogClose = document.createElement('button');
    let mediaPreviewReturnFocus = null;

    mediaDialog.className = 'media-lightbox';
    mediaDialog.setAttribute('aria-labelledby', 'mediaLightboxTitle');
    mediaDialogInner.className = 'media-lightbox-inner';
    mediaDialogStage.className = 'media-lightbox-stage';
    mediaDialogTitle.className = 'media-lightbox-title';
    mediaDialogTitle.id = 'mediaLightboxTitle';
    mediaDialogClose.className = 'media-lightbox-close';
    mediaDialogClose.type = 'button';
    mediaDialogClose.setAttribute('aria-label', isFrench ? 'Fermer l’aperçu' : 'Close preview');
    mediaDialogClose.textContent = '×';
    mediaDialogInner.append(mediaDialogStage, mediaDialogTitle, mediaDialogClose);
    mediaDialog.append(mediaDialogInner);
    document.body.append(mediaDialog);

    function closeMediaPreview() {
      if (mediaDialog.open) mediaDialog.close();
    }

    function clearMediaPreview() {
      const activeVideo = mediaDialogStage.querySelector('video');
      if (activeVideo) activeVideo.pause();
      mediaDialogStage.replaceChildren();
      document.body.classList.remove('media-dialog-open');
      if (mediaPreviewReturnFocus) mediaPreviewReturnFocus.focus();
      mediaPreviewReturnFocus = null;
    }

    function openMediaPreview(trigger) {
      const sourceVideo = trigger.querySelector('video');
      const sourceImage = trigger.querySelector('img');
      const title = trigger.querySelector('h3')?.textContent?.trim()
        || trigger.getAttribute('aria-label')
        || (isFrench ? 'Aperçu du projet' : 'Project preview');
      let previewMedia = null;

      if (sourceVideo) {
        const source = sourceVideo.querySelector('source');
        const videoUrl = sourceVideo.currentSrc
          || source?.src
          || source?.dataset.src;
        if (!videoUrl) return;
        previewMedia = document.createElement('video');
        previewMedia.src = videoUrl;
        previewMedia.controls = true;
        previewMedia.autoplay = true;
        previewMedia.muted = true;
        previewMedia.defaultMuted = true;
        previewMedia.playsInline = true;
        previewMedia.preload = 'metadata';
        previewMedia.poster = sourceVideo.poster;
        previewMedia.setAttribute('aria-label', title);
      } else if (sourceImage) {
        previewMedia = document.createElement('img');
        previewMedia.src = sourceImage.currentSrc || sourceImage.src;
        previewMedia.alt = sourceImage.alt || title;
      }

      if (!previewMedia) return;
      mediaPreviewReturnFocus = trigger;
      mediaDialogTitle.textContent = title;
      mediaDialogStage.replaceChildren(previewMedia);
      document.body.classList.add('media-dialog-open');
      mediaDialog.showModal();
      if (sourceVideo) {
        previewMedia.play().catch(function () {
          // Native controls remain available if a browser blocks autoplay.
        });
      }
      mediaDialogClose.focus();
      trackEvent('select_content', {
        content_type: sourceVideo ? 'video_preview' : 'image_preview',
        item_id: trigger.id || title,
      });
    }

    mediaPreviewTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        openMediaPreview(trigger);
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openMediaPreview(trigger);
      });
    });

    mediaDialogClose.addEventListener('click', closeMediaPreview);
    mediaDialog.addEventListener('click', function (event) {
      if (event.target === mediaDialog) closeMediaPreview();
    });
    mediaDialog.addEventListener('close', clearMediaPreview);
  }

  if (scrollToggle) {
    function updateScrollButton() {
      const scrollPosition = getScrollTop();
      scrollToggle.classList.toggle('is-visible', scrollPosition > 360);
      scrollToggle.setAttribute('aria-label', isFrench ? 'Revenir en haut' : 'Back to top');
    }

    updateScrollButton();

    window.addEventListener('scroll', updateScrollButton, { passive: true });
    window.addEventListener('resize', updateScrollButton);

    scrollToggle.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const sendingLabel = projectForm.dataset.sendingLabel || 'Sending…';
    const submitLabel = projectForm.dataset.submitLabel || 'Submit Project Request';
    const successMessage =
      projectForm.dataset.successMessage ||
      'Thanks — your project request was received. ShotByDiallo will be in touch within one business day.';
    const fallbackErrorMessage =
      projectForm.dataset.errorMessage ||
      'Something went wrong. Please email shotbydiallo@gmail.com instead.';
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
      submitButton.textContent = sendingLabel;
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
        setFormStatus(successMessage);
      } catch (error) {
        setFormStatus(
          projectForm.dataset.errorMessage || error.message || fallbackErrorMessage,
          'error',
        );
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
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
      (document.getElementById('chooseService') || document.getElementById('services'))?.scrollIntoView({
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
    selectAudience(selectedTab?.dataset.audienceTab || 'business', false);
  }

  document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]').forEach(function (link) {
    link.addEventListener('click', function () {
      const method = link.getAttribute('href').startsWith('tel:') ? 'phone' : 'email';
      trackEvent('contact', { method: method });
    });
  });

  const internalLinks = document.querySelectorAll('a[href^="/"]');

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
