(function initializeGoogleAnalytics() {
  "use strict";

  var config = window.SHOTBYDIALLO_CONFIG || {};
  var measurementId = String(config.googleAnalyticsMeasurementId || "").trim();
  var consentKey = "shotbydiallo_analytics_consent_v1";
  var analyticsStarted = false;

  // Keep analytics disabled until a real GA4 web-stream ID is configured.
  if (!measurementId) return;

  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    console.warn("Google Analytics is disabled: invalid GA4 Measurement ID.");
    return;
  }

  function storedChoice() {
    try {
      return window.localStorage.getItem(consentKey);
    } catch {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(consentKey, choice);
    } catch {
      // Browsing continues normally when local storage is unavailable.
    }
  }

  function startAnalytics() {
    if (analyticsStarted) return;
    analyticsStarted = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function gtag() {
        window.dataLayer.push(arguments);
      };

    window.gtag("js", new Date());
    window.gtag("config", measurementId, { anonymize_ip: true });

    var googleTag = document.createElement("script");
    googleTag.async = true;
    googleTag.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);
    document.head.appendChild(googleTag);
  }

  function removeConsentNotice() {
    document.getElementById("analyticsConsent")?.remove();
  }

  function showConsentNotice() {
    if (document.getElementById("analyticsConsent")) return;

    var notice = document.createElement("aside");
    notice.className = "cookie-consent";
    notice.id = "analyticsConsent";
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-labelledby", "analyticsConsentTitle");
    notice.innerHTML =
      '<div><strong id="analyticsConsentTitle">Your privacy matters</strong>' +
      '<p>We use optional Google Analytics cookies to understand site visits and improve the experience. The contact form works without them. <a href="/privacy">Privacy policy</a></p></div>' +
      '<div class="cookie-consent-actions"><button type="button" class="btn secondary-btn" data-analytics-choice="declined">Reject optional</button>' +
      '<button type="button" class="btn primary-btn" data-analytics-choice="accepted">Accept analytics</button></div>';

    notice.querySelectorAll("[data-analytics-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        var choice = button.dataset.analyticsChoice;
        saveChoice(choice);
        removeConsentNotice();
        if (choice === "accepted") startAnalytics();
      });
    });

    document.body.appendChild(notice);
  }

  function setupChoiceControls() {
    document.getElementById("cookieSettingsButton")?.addEventListener("click", function () {
      try {
        window.localStorage.removeItem(consentKey);
      } catch {
        // The notice can still be shown when local storage is unavailable.
      }
      showConsentNotice();
    });
  }

  if (storedChoice() === "accepted") startAnalytics();
  document.addEventListener("DOMContentLoaded", function () {
    setupChoiceControls();
    if (!storedChoice()) showConsentNotice();
  });
})();
