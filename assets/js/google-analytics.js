(function initializeGoogleAnalytics() {
  "use strict";

  var config = window.SHOTBYDIALLO_CONFIG || {};
  var measurementId = String(config.googleAnalyticsMeasurementId || "").trim();

  // Keep analytics disabled until a real GA4 web-stream ID is configured.
  if (!measurementId) return;

  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
    console.warn("Google Analytics is disabled: invalid GA4 Measurement ID.");
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  var googleTag = document.createElement("script");
  googleTag.async = true;
  googleTag.src =
    "https://www.googletagmanager.com/gtag/js?id=" +
    encodeURIComponent(measurementId);
  document.head.appendChild(googleTag);
})();
