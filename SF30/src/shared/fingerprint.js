// Device fingerprinting — generates a stable browser fingerprint for license binding
// Used to detect key sharing and tie tokens to specific devices.

(function (global) {
  "use strict";

  if (global.SG_FINGERPRINT) return;

  var _cachedFingerprint = null;
  var _cachedComponents = "";

  // WebGL fingerprint — exposes GPU vendor + renderer, rarely spoofed correctly
  function getWebGLFingerprint() {
    try {
      var canvas = document.createElement("canvas");
      var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return "no-webgl";
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (!dbg) return "webgl-" + (gl.getParameter(gl.VERSION) || "unknown");
      var vendor   = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   || "";
      var renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "";
      return "webgl:" + vendor + "|" + renderer;
    } catch (e) {
      return "webgl-error";
    }
  }

  // AudioContext fingerprint — renders a short audio waveform; DSP output varies per device.
  // Standard technique used by fraud-detection libraries (FingerprintJS, ClientJS, etc.)
  async function getAudioFingerprint() {
    try {
      if (typeof OfflineAudioContext === "undefined") return "no-audio";
      var ctx = new OfflineAudioContext(1, 44100, 44100);
      var osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 10000;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50;
      comp.knee.value = 40;
      comp.ratio.value = 12;
      comp.attack.value = 0;
      comp.release.value = 0.25;
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      var buf = await ctx.startRendering();
      var ch = buf.getChannelData(0);
      var sum = 0;
      for (var i = 4500; i < 5000; i++) sum += Math.abs(ch[i] || 0);
      return "audio:" + sum.toFixed(20);
    } catch (e) {
      return "audio-error";
    }
  }

  async function getFingerprint() {
    // 1. Check for a persisted fingerprint so popup and SW always agree.
    //    CRITICAL: existing customers keep their legacy fingerprint — only NEW
    //    installs get the enhanced v2 components. This preserves backward
    //    compatibility with already-issued 30-day license keys.
    var storedFp = "";
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      storedFp = await new Promise(function (resolve) {
        chrome.storage.local.get({ sg_device_fp: "" }, function (res) {
          resolve(res.sg_device_fp || "");
        });
      });
    }
    if (storedFp) {
      _cachedFingerprint = storedFp;
      _cachedComponents = "stored";
      return storedFp;
    }

    var components = [];

    try {
      components.push(navigator.userAgent || "");
      components.push(screen.width + "x" + screen.height + "x" + screen.colorDepth);
      components.push(navigator.language || "");
      components.push(new Date().getTimezoneOffset());
      components.push(navigator.hardwareConcurrency || "");
      components.push(navigator.platform || "");

      // Canvas fingerprinting — subtle but stable
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      var txt = "ShiftGrabber fp v2 " + navigator.userAgent;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 150, 30);
      ctx.fillStyle = "#069";
      ctx.fillText(txt, 2, 2);
      components.push(canvas.toDataURL().slice(-50));

      // NEW in V2: WebGL GPU fingerprint
      components.push(getWebGLFingerprint());

      // NEW in V2: AudioContext DSP fingerprint
      try { components.push(await getAudioFingerprint()); } catch (_) { components.push("audio-skipped"); }
    } catch (e) {}

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

    // Persist so SW and popup always use the same fingerprint
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ sg_device_fp: fp });
    }

    return fp;
  }

  global.SG_FINGERPRINT = { getFingerprint: getFingerprint };

})(typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this);
