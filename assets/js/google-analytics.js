(function initializeGoogleAnalytics() {
  "use strict";

  var config = window.SHOTBYDIALLO_CONFIG || {};
  var measurementId = String(config.googleAnalyticsMeasurementId || "").trim();
  var consentKey = "shotbydiallo_analytics_consent_v1";
  var analyticsStarted = false;
  var isFrench = document.documentElement.lang.toLowerCase().indexOf("fr") === 0;

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
    window["ga-disable-" + measurementId] = false;

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
    googleTag.dataset.shotbydialloAnalytics = measurementId;
    googleTag.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);
    document.head.appendChild(googleTag);
  }

  function stopAnalytics() {
    window["ga-disable-" + measurementId] = true;
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
    }
    document.querySelector('[data-shotbydiallo-analytics]')?.remove();
    analyticsStarted = false;

    var analyticsCookie = "_ga_" + measurementId.replace("G-", "");
    ["_ga", analyticsCookie].forEach(function (cookieName) {
      document.cookie = cookieName + "=; Max-Age=0; path=/; SameSite=Lax";
      document.cookie = cookieName + "=; Max-Age=0; path=/; domain=.shotbydiallo.com; SameSite=Lax";
    });
  }

  function removeConsentNotice() {
    document.getElementById("analyticsConsent")?.remove();
    document.body.classList.remove("consent-open");
  }

  function showConsentNotice() {
    if (document.getElementById("analyticsConsent")) return;

    var notice = document.createElement("div");
    notice.className = "cookie-consent";
    notice.id = "analyticsConsent";
    notice.setAttribute("role", "dialog");
    notice.setAttribute("aria-labelledby", "analyticsConsentTitle");
    notice.setAttribute("aria-describedby", "analyticsConsentDescription");
    notice.innerHTML = isFrench
      ? '<div class="cookie-consent-copy"><span class="cookie-consent-label">Confidentialité</span><strong id="analyticsConsentTitle">Nous respectons votre vie privée.</strong>' +
        '<p id="analyticsConsentDescription">Nous utilisons des témoins d’analyse facultatifs pour mesurer l’audience et améliorer votre expérience. Aucun témoin d’analyse n’est activé sans votre accord. En cliquant sur « Tout accepter », vous consentez à notre <a href="/fr/confidentialite#temoins">politique de confidentialité et de témoins</a>.</p></div>' +
        '<div class="cookie-consent-actions"><button type="button" class="btn cookie-choice cookie-reject" data-analytics-choice="declined">Tout refuser</button>' +
        '<button type="button" class="btn cookie-choice cookie-accept" data-analytics-choice="accepted">Tout accepter</button></div>'
      : '<div class="cookie-consent-copy"><span class="cookie-consent-label">Privacy</span><strong id="analyticsConsentTitle">We respect your privacy.</strong>' +
        '<p id="analyticsConsentDescription">We use optional analytics cookies to measure visits and improve your experience. No analytics cookie is enabled without your permission. By selecting “Accept all,” you agree to our <a href="/privacy#cookies">privacy and cookie policy</a>.</p></div>' +
        '<div class="cookie-consent-actions"><button type="button" class="btn cookie-choice cookie-reject" data-analytics-choice="declined">Reject all</button>' +
        '<button type="button" class="btn cookie-choice cookie-accept" data-analytics-choice="accepted">Accept all</button></div>';

    notice.querySelectorAll("[data-analytics-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        var choice = button.dataset.analyticsChoice;
        saveChoice(choice);
        removeConsentNotice();
        if (choice === "accepted") startAnalytics();
        else stopAnalytics();
      });
    });

    document.body.classList.add("consent-open");
    document.body.appendChild(notice);
  }

  function setupChoiceControls() {
    document.querySelectorAll("#cookieSettingsButton, [data-cookie-settings]").forEach(function (control) {
      control.addEventListener("click", function () {
        showConsentNotice();
      });
    });
  }

  if (storedChoice() === "accepted") startAnalytics();
  document.addEventListener("DOMContentLoaded", function () {
    setupChoiceControls();
    if (!storedChoice()) showConsentNotice();
  });
})();
