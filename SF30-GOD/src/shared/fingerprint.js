// Device fingerprinting — generates a stable browser fingerprint for license binding
// Used to detect key sharing and tie tokens to specific devices.

(function (global) {
  "use strict";

  if (global.SG_FINGERPRINT) {return;}

  var _cachedFingerprint = null;
  var _cachedComponents = "";

  async function getFingerprint() {
    var components = [];

    // Stable properties — never fail
    components.push(navigator.userAgent || "");
    components.push(
      typeof screen !== "undefined"
        ? screen.width + "x" + screen.height + "x" + screen.colorDepth
        : "no-screen"
    );
    components.push(navigator.language || "");
    // Use fixed epoch to avoid DST changes altering the fingerprint
    components.push(new Date("2000-01-01T00:00:00Z").getTimezoneOffset());
    components.push(navigator.hardwareConcurrency || "");
    components.push(navigator.platform || "");

    // Canvas fingerprinting — best effort, isolated try-catch
    try {
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      var txt = "ShiftGrabber fp v1 " + navigator.userAgent;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 150, 30);
      ctx.fillStyle = "#069";
      ctx.fillText(txt, 2, 2);
      components.push(canvas.toDataURL().slice(-50)); // last 50 chars of data URL
    } catch (e) { /* canvas unavailable (e.g. service worker) — skip */ }

    var raw = components.join("|");

    // Return cached fingerprint if components haven't changed
    if (_cachedFingerprint && raw === _cachedComponents) {
      return _cachedFingerprint;
    }

    // SHA-256 hash the components
    var encoder = new TextEncoder();
    var data = encoder.encode(raw);
    var hashBuffer = await crypto.subtle.digest("SHA-256", data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    var fp = hashArray.map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");

    _cachedComponents = raw;
    _cachedFingerprint = fp;
    return fp;
  }

  global.SG_FINGERPRINT = { getFingerprint: getFingerprint };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
