// api-layer.js — runs in page's MAIN world for full cookie/CORS access
// V9: Self-contained polling of 7-day window per tab + instant claiming
// Stealth: single claim attempt, poll jitter, CSRF cache, clean query filters

(function () {
  if (window["__sg_" + "api_v3"]) {return;}
  window["__sg_" + "api_v3"] = true;

  var GQL = "https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql";

  // Rotated query shapes — semantically identical, syntactically varied to avoid fingerprinting
  var POLL_Q_SET = [
    "query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end __typename}duration{value __typename}site{name __typename}__typename}__typename}__typename}}",
    "query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(filter:$filter,timeRange:$timeRange){opportunities(opportunityTypes:$opportunityTypes){id shift{id timeRange{start end __typename}duration{value __typename}site{name __typename}__typename}type __typename}__typename}__typename}}",
    "query PollShifts($filter:ShiftOpportunitiesFilter,$timeRange:DateTimeRangeInput!,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){shift{id site{name __typename}timeRange{start end __typename}duration{value __typename}__typename}id type __typename}__typename}__typename}}"
  ];

  var CLAIM_Q_SET = [
    "mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{id}}}",
    "mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{timeRange{start end}}}}",
    "mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{site{name}duration{value}}}}"
  ];

  // Rotated operation names — avoid static "PollShifts" / "AddShift" WAF signatures
  var POLL_OP_NAMES = ["PollShifts", "GetShiftList", "QueryOpportunities"];
  var CLAIM_OP_NAMES = ["AddShift", "ClaimShift", "PickUpShift"];

  var currentQueryIndex = 0;
  var extractedClientId = null;

  // --- state ---
  var claimedIds = {};
  var pollTimer = null;
  var pollInterval = 1000;
  var running = false;
  var pollCount = 0;
  var cachedEid = null;
  var blacklistDates = [];
  var tabWindow = null;
  var baseInterval = 1000;
  var consecutiveErrors = 0;
  var rateLimited = false;
  var errorRecoveryTimer = null;
  var backoffMs = 5000;          // exponential backoff base
  var MAX_BACKOFF_MS = 40000;    // cap at 40 s

  // --- CSRF cache — read once per 60s, not on every request ---
  var cachedCsrf = null;
  var csrfTs = 0;

  function getCsrf(force) {
    var now = Date.now();
    if (!force && cachedCsrf && (now - csrfTs) < 60000) {return cachedCsrf;}
    try {
      var m = document.cookie.match(/anti-csrftoken-a2z=([^;]+)/);
      if (m) { cachedCsrf = decodeURIComponent(m[1]); csrfTs = now; return cachedCsrf; }
      var el = document.querySelector('meta[name="anti-csrftoken-a2z"]');
      if (el) { cachedCsrf = el.getAttribute('content'); csrfTs = now; return cachedCsrf; }
    } catch (e) { /* intentionally empty */ }
    return null;
  }

  // --- helpers ---
  function eid() {
    if (cachedEid) {return cachedEid;}
    var pat = /aza-user-features-(\d+)-prod/;
    try {
      // 1. localStorage
      var k = Object.keys(localStorage).find(function (k) { return pat.test(k); });
      if (k) { cachedEid = k.match(pat)[1]; return cachedEid; }
      // 2. sessionStorage
      k = Object.keys(sessionStorage).find(function (k) { return pat.test(k); });
      if (k) { cachedEid = k.match(pat)[1]; return cachedEid; }
      // 3. window.__sg_eid_v3 (set by main.js if already found)
      if (window["__sg_eid_v3"]) { cachedEid = window["__sg_eid_v3"]; return cachedEid; }
      // 4. DOM meta tag
      var meta = document.querySelector('meta[name="employee-id"]');
      if (meta) { cachedEid = meta.getAttribute('content'); return cachedEid; }
    } catch (e) { /* intentionally empty */ }
    return null;
  }

  // Extract x-atoz-client-id from real page requests instead of hardcoding
  function sniffClientId() {
    if (extractedClientId) {return extractedClientId;}
    try {
      var scripts = document.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i++) {
        var text = scripts[i].textContent || '';
        var m = text.match(/x-atoz-client-id["']?\s*[:=]\s*["']([^"']+)["']/);
        if (m) { extractedClientId = m[1]; return extractedClientId; }
      }
      // Fallback: try to read from any loaded JS that sets it globally
      if (window.__ATOZ_CLIENT_ID) { extractedClientId = window.__ATOZ_CLIENT_ID; return extractedClientId; }
    } catch (e) { /* intentionally empty */ }
    return "SCHEDULE_MANAGEMENT_SERVICE"; // last-resort fallback
  }

  // Headers that match what a real browser sends for a same-origin JSON fetch
  function makeHeaders() {
    var h = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-atoz-client-id": sniffClientId(),
      "Referer": window.location.href
    };
    var t = getCsrf();
    if (t) {h["anti-csrftoken-a2z"] = t;}
    return h;
  }

  // Get 7-day window — uses tab's date if available, else today
  function getQueryRange() {
    if (tabWindow) {
      return { start: tabWindow.windowStart, end: tabWindow.windowEnd };
    }
    var now = new Date();
    var start = now.toISOString().split('T')[0] + "T04:00:00.000Z";
    var end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { start: start, end: end.toISOString().split('T')[0] + "T03:59:59.999Z" };
  }

  // Terminal errors — shift is gone, retrying wastes a request and looks suspicious
  var TERMINAL_STRINGS = ['capacity', 'expired', 'already accepted', 'not eligible', 'ineligible'];

  function isTerminalError(data) {
    var errs = data && (data.errors || (data.data && data.data.errors));
    if (!errs) {return false;}
    var s = JSON.stringify(errs).toLowerCase();
    return TERMINAL_STRINGS.some(function (t) { return s.indexOf(t) !== -1; });
  }

  // --- stealth helpers ---
  // Poisson-distributed delay — matches natural browsing patterns far better than uniform jitter
  function poissonDelay(meanMs) {
    return Math.max(50, Math.min(5000, -meanMs * Math.log(1 - Math.random())));
  }

  // Human-like reaction delay before claiming — real humans don't react in 0ms
  function humanReactionDelay() {
    return 80 + Math.floor(Math.random() * 220); // 80–300 ms
  }

  // Decoy interactions removed — synthetic events have isTrusted=false which is a bot signal.
  // Poisson delays + query rotation provide sufficient stealth without detectable fake events.
  function injectDecoyInteraction() {
    // No-op: synthetic scroll/mousemove events are trivially detectable.
    // Realistic stealth comes from timing distribution and query shape rotation.
  }

  // Periodic cleanup of claimed IDs to prevent unbounded memory growth
  setInterval(function () {
    var keys = Object.keys(claimedIds);
    if (keys.length > 500) {
      // Remove oldest 50% of entries
      keys.slice(0, Math.floor(keys.length / 2)).forEach(function (k) { delete claimedIds[k]; });
    }
  }, 300000); // every 5 minutes

  // --- claim — single attempt only. Retries are the #1 bot detection signal. ---
  function fireClaim(id, oppId, shiftInfo) {
    if (claimedIds[oppId]) {return;}

    // Blacklist check — skip dates user opted out of
    if (blacklistDates.length > 0 && shiftInfo) {
      var shiftDate = shiftInfo.start ? shiftInfo.start.split('T')[0] : null;
      if (shiftDate && blacklistDates.indexOf(shiftDate) !== -1) {return;}
    }

    claimedIds[oppId] = true;

    var url = GQL + "?employeeId=" + id;
    var claimQ = CLAIM_Q_SET[currentQueryIndex % CLAIM_Q_SET.length];
    var claimOpName = CLAIM_OP_NAMES[currentQueryIndex % CLAIM_OP_NAMES.length];
    var body = JSON.stringify({
      operationName: claimOpName,
      variables: { shiftOpportunityId: { shiftOpportunityId: oppId } },
      query: claimQ
    });

    // Human reaction delay before firing claim
    setTimeout(function () {
      fetch(url, { method: "POST", credentials: "include", headers: makeHeaders(), body: body })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          // Shift is gone — don't retry, no notification
          if (isTerminalError(data)) {return;}

          // Report result to main.js (success or final failure)
          window.postMessage({
            sg: 1, type: 'SG_CLAIM_RESULT', secret: SG_CONSTS.MSG_SECRET,
            data: data, oppId: oppId,
            attempt: 1, shift: shiftInfo || null
          }, '*');
        })
        .catch(function (err) {
          // Network error — do NOT retry. Log silently.
          console.warn('[SG] Claim network error (no retry):', err?.message || err);
        });
    }, humanReactionDelay());
  }

  // --- GraphQL response validation — defensive against malformed or unexpected shapes ---
  function validateGraphQLResponse(data) {
    if (!data || typeof data !== 'object') {
      console.warn('[SG] GraphQL response: not an object');
      return [];
    }
    if (data.errors) {
      console.warn('[SG] GraphQL errors:', JSON.stringify(data.errors).slice(0, 200));
      return [];
    }
    var root = data.data;
    if (!root || typeof root !== 'object') {
      console.warn('[SG] GraphQL response: missing data root');
      return [];
    }
    var so = root.shiftOpportunities;
    if (!so || typeof so !== 'object') {
      console.warn('[SG] GraphQL response: missing shiftOpportunities');
      return [];
    }
    var opps = so.opportunities;
    if (!Array.isArray(opps)) {
      console.warn('[SG] GraphQL response: opportunities not an array');
      return [];
    }
    return opps;
  }

  // --- rate limit handling — exponential backoff ---
  function handleRateLimit() {
    consecutiveErrors++;
    if (!rateLimited) {
      rateLimited = true;
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      console.log('[SG] ⚠️ RATE LIMITED (429) — backing off to ' + backoffMs + ' ms polls');
      window.postMessage({ sg: 1, type: 'SG_RATE_LIMITED', limited: true, secret: SG_CONSTS.MSG_SECRET }, '*');
      pollInterval = backoffMs;
      if (errorRecoveryTimer) {clearTimeout(errorRecoveryTimer);}
      errorRecoveryTimer = setTimeout(function () {
        rateLimited = false;
        consecutiveErrors = 0;
        pollInterval = baseInterval;
        backoffMs = 5000; // reset for next burst
        window.postMessage({ sg: 1, type: 'SG_RATE_LIMITED', limited: false, secret: SG_CONSTS.MSG_SECRET }, '*');
      }, backoffMs);
    }
  }

  // --- pollOnce — single request covers full 7-day window, returns promise when done ---
  function pollOnce() {
    return new Promise(function (resolve) {
      var id = eid();
      if (!id) { resolve(); return; }

      // Send eid to main.js once (relayed to service worker)
      if (!window["__sg_eid_sent_v3"]) {
        window["__sg_eid_sent_v3"] = true;
        window.postMessage({ sg: 1, type: 'SG_EID', eid: id, secret: SG_CONSTS.MSG_SECRET }, '*');
      }

      pollCount++;
      var range = getQueryRange();

      // Rotate query shape to avoid fingerprinting
      var idx = currentQueryIndex % POLL_Q_SET.length;
      var pollQ = POLL_Q_SET[idx];
      var pollOpName = POLL_OP_NAMES[idx];
      currentQueryIndex = (currentQueryIndex + 1) % POLL_Q_SET.length;
      fetch(GQL + "?employeeId=" + id, {
        method: "POST",
        credentials: "include",
        headers: makeHeaders(),
        body: JSON.stringify({
          operationName: pollOpName,
          variables: {
            // Only query eligible available ADD shifts — matches real browser behavior.
            filter: { includeIneligible: false },
            timeRange: range,
            opportunityTypes: { types: ["ADD"] }
          },
          query: pollQ
        })
      })
        .then(function (r) {
          if (r.status === 429) { handleRateLimit(); return null; }
          return r.json();
        })
        .then(function (data) {
          if (!data) { resolve(); return; }

          var opps = validateGraphQLResponse(data);

          // Claim any available ADD shift — fires immediately on detection (0ms reaction)
          for (var i = 0; i < opps.length; i++) {
            var opp = opps[i];
            if (opp && opp.type === 'ADD' && opp.id && !claimedIds[opp.id]) {
              var info = null;
              try {
                info = {
                  start: opp.shift.timeRange.start,
                  end: opp.shift.timeRange.end,
                  duration: opp.shift.duration.value,
                  site: opp.shift.site.name
                };
              } catch (e) { /* intentionally empty */ }
              fireClaim(id, opp.id, info);
            }
          }

          consecutiveErrors = 0;
          backoffMs = 5000; // reset backoff on success
          resolve();
        })
        .catch(function () { resolve(); });
    });
  }

  // --- polling loop — sequential + Poisson-distributed intervals ---
  // Poisson distribution matches natural human browsing far better than uniform jitter.
  // Mean interval is configurable; actual delays cluster around the mean with long-tail variance.
  function startLoop() {
    if (running) {return;}
    // Only poll on actual schedule pages
    if (!window.location.pathname.includes("/shifts/schedule/find")) {
      console.log('[SG] Not on schedule page — polling inactive');
      return;
    }
    running = true;
    function loop() {
      if (!running) {return;}
      injectDecoyInteraction();
      pollOnce().then(function () {
        var delay = poissonDelay(pollInterval);
        pollTimer = setTimeout(loop, Math.max(300, delay));
      });
    }
    loop();
  }

  function stopLoop() {
    running = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  // --- messages from main.js ---
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || !e.data.sg) {return;}
    // Validate message secret to prevent cross-script spoofing
    if (e.data.secret !== SG_CONSTS.MSG_SECRET) {
      console.warn('[SG API] Rejected message with invalid secret');
      return;
    }

    if (e.data.type === 'SG_START_POLLING') {
      baseInterval = e.data.interval || 1000;
      pollInterval = baseInterval;
      tabWindow = e.data.tabWindow || null;
      consecutiveErrors = 0;
      rateLimited = false;
      if (tabWindow) {
        console.log('[SG] Window set: ' + tabWindow.start + ' to +7 days');
      }
      startLoop();
    }
    if (e.data.type === 'SG_STOP_POLLING') {stopLoop();}
    if (e.data.type === 'SG_SET_SPEED') {
      baseInterval = e.data.interval || 1000;
      if (!rateLimited) {pollInterval = baseInterval;}
    }
    if (e.data.type === 'SG_SET_BLACKLIST_DATES') {
      blacklistDates = e.data.blacklist || [];
      console.log('[SG] Blacklist set:', blacklistDates.length === 0 ? 'none' : blacklistDates.join(', '));
    }
  });

  // --- periodic stat log ---
  setInterval(function () {
    if (pollCount > 0) {
      var info = '[SG] API: ' + pollCount + ' polls/30s · ~' + pollInterval + 'ms ± 200 · eid=' + (cachedEid || 'none');
      if (tabWindow) {info += ' · window=' + tabWindow.start + '+7d';}
      if (blacklistDates.length > 0) {info += ' · blacklist=' + blacklistDates.join(',');}
      console.log(info);
      pollCount = 0;
    }
  }, 30000);

  console.log('[SG] API layer v3 — eid:', eid() || 'pending', '· csrf:', getCsrf() ? 'found' : 'none');
})();
