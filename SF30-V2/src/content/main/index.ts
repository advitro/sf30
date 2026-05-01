/**
 * MAIN World Script — SF30 V2.0
 *
 * Injected dynamically into the page's MAIN world via
 * chrome.scripting.executeScript({ world: 'MAIN' }).
 *
 * Responsibilities:
 * 1. GraphQL polling via page's own fetch/cookie context
 * 2. Instant shift claiming
 * 3. CSRF token extraction
 * 4. Employee ID discovery
 *
 * CRITICAL: This script MUST NOT:
 * - Set any window properties (detectable by page scripts)
 * - Log to console in production (stripped by build)
 * - Use chrome.* APIs (not available in MAIN world)
 * - Use distinctive patterns (queries must blend in)
 *
 * Communication with isolated world via window.postMessage.
 */

// ── Types (inline to avoid module imports in MAIN world) ──

interface ShiftOpportunity {
  id: string;
  type: string;
  shift: {
    id: string;
    timeRange: { start: string; end: string };
    duration: { value: number };
    site: { name: string };
  };
}

interface PollingConfig {
  interval: number;
  turbo: boolean;
  blacklistDates: string[];
}

// ── Constants ──

const GQL_URL = 'https://atoz-apps.amazon.work/apis/ScheduleManagementService/graphql';

const POLL_QUERIES = [
  // Query variant 1: Standard field order
  'query PollShifts($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end}duration{value}site{name}}}}}',
  // Query variant 2: Swapped argument order
  'query GetShiftList($filter:ShiftOpportunitiesFilter,$timeRange:DateTimeRangeInput!,$opportunityTypes:TypeFilter!){shiftOpportunities(filter:$filter,timeRange:$timeRange){opportunities(opportunityTypes:$opportunityTypes){shift{id site{name}timeRange{start end}duration{value}}id type}}}',
  // Query variant 3: Different field selection
  'query QueryOpportunities($timeRange:DateTimeRangeInput!,$filter:ShiftOpportunitiesFilter,$opportunityTypes:TypeFilter!){shiftOpportunities(timeRange:$timeRange,filter:$filter){opportunities(opportunityTypes:$opportunityTypes){id type shift{id timeRange{start end}site{name}}}}}',
] as const;

const CLAIM_MUTATIONS = [
  'mutation AddShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{id}}}',
  'mutation ClaimShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{timeRange{start end}}}}',
  'mutation PickUpShift($shiftOpportunityId:AddShiftInput!){addShift(input:$shiftOpportunityId){shift{site{name}duration{value}}}}',
] as const;

const TERMINAL_ERRORS = ['capacity', 'expired', 'already accepted', 'not eligible', 'ineligible'];

// ── State ──

let isRunning = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
const currentConfig: PollingConfig = {
  interval: 1000,
  turbo: false,
  blacklistDates: [],
};
let currentQueryIndex = 0;
let _pollCount = 0;
let claimedIds = new Set<string>();
let cachedCsrf: string | null = null;
let csrfTimestamp = 0;
let cachedEid: string | null = null;
let extractedClientId: string | null = null;
let consecutiveErrors = 0;
let rateLimited = false;
let isolatedToken: string | null = null;

// ── Message Handling (from isolated world) ──

window.addEventListener('message', (e) => {
  if (e.source !== window) {return;}
  if (e.data?.source !== 'sf30-v2-isolated') {return;}
  if (e.origin !== window.location.origin) {return;}

  // Store token for authenticated responses
  if (e.data?.token) {
    isolatedToken = e.data.token;
  }

  const { action } = e.data as { action: string; payload?: unknown };

  switch (action) {
    case 'START_POLLING':
      startPolling();
      break;
    case 'STOP_POLLING':
      stopPolling();
      break;
    case 'SET_SPEED': {
      const p = e.data.payload as { interval?: number; turbo?: boolean };
      if (p.interval !== undefined) {
        currentConfig.interval = p.interval;
      }
      if (p.turbo !== undefined) {
        currentConfig.turbo = p.turbo;
        currentConfig.interval = p.turbo ? 500 : 1000;
      }
      break;
    }
    case 'SET_BLACKLIST': {
      const p = e.data.payload as { blacklistDates?: string[] };
      if (p.blacklistDates) {
        currentConfig.blacklistDates = p.blacklistDates;
      }
      break;
    }
  }
});

// ── Polling Logic ──

function startPolling(): void {
  if (isRunning) {return;}

  // Only poll on schedule pages
  if (!window.location.pathname.includes('/shifts/schedule/find')) {
    return;
  }

  isRunning = true;
  consecutiveErrors = 0;
  rateLimited = false;

  scheduleNextPoll();
}

function stopPolling(): void {
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function scheduleNextPoll(): void {
  if (!isRunning) {return;}

  const delay = computeJitteredDelay(currentConfig.interval);
  pollTimer = setTimeout(() => {
    void executePoll();
  }, delay);
}

function computeJitteredDelay(baseMs: number): number {
  // Poisson-like distribution: cluster around mean with long tail
  const jitter = -baseMs * Math.log(1 - Math.random());
  return Math.max(300, Math.min(5000, jitter));
}

async function executePoll(): Promise<void> {
  if (!isRunning) {return;}

  const eid = getEmployeeId();
  if (!eid) {
    scheduleNextPoll();
    return;
  }

  // Send EID to isolated world once
  if (!cachedEid) {
    cachedEid = eid;
    sendToIsolated('EID_FOUND', { eid });
  }

  _pollCount++;

  try {
    const query = getNextQuery();
    const range = getQueryRange();

    const response = await fetch(GQL_URL + '?employeeId=' + encodeURIComponent(eid), {
      method: 'POST',
      credentials: 'include',
      headers: makeHeaders(),
      body: JSON.stringify({
        operationName: getOperationName(),
        variables: {
          filter: { includeIneligible: false },
          timeRange: range,
          opportunityTypes: { types: ['ADD'] },
        },
        query: query,
      }),
    });

    if (response.status === 429) {
      handleRateLimit();
      scheduleNextPoll();
      return;
    }

    let data: { data?: unknown; errors?: Array<{ message: string }> };
    try {
      data = await response.json();
    } catch {
      consecutiveErrors++;
      applyBackoff();
      scheduleNextPoll();
      return;
    }

    if (data.errors) {
      consecutiveErrors++;
      applyBackoff();
    } else {
      consecutiveErrors = 0;
      // Reset interval to config default after success
      currentConfig.interval = currentConfig.turbo ? 500 : 1000;

      const opps = extractOpportunities(data.data);

      for (const opp of opps) {
        if (opp?.type === 'ADD' && opp?.id && !claimedIds.has(opp.id)) {
          // Filter by blacklist dates
          if (isBlacklisted(opp)) {continue;}
          await claimShift(eid, opp);
        }
      }
    }
  } catch (_e) {
    consecutiveErrors++;
    applyBackoff();
  }

  scheduleNextPoll();
}

// ── Claiming ──

async function claimShift(eid: string, opp: ShiftOpportunity): Promise<void> {
  // Add to claimed set immediately to prevent double-claims
  claimedIds.add(opp.id);

  // Guard against malformed opportunities
  if (!opp.shift?.id) {
    sendToIsolated('CLAIM_RESULT', {
      oppId: opp.id,
      success: false,
      error: 'missing-shift-id',
      attempt: 1,
    });
    return;
  }

  // Human-like reaction delay
  await sleep(80 + Math.floor(Math.random() * 220));

  const mutation = CLAIM_MUTATIONS[Math.floor(Math.random() * CLAIM_MUTATIONS.length)];

  try {
    const response = await fetch(GQL_URL + '?employeeId=' + encodeURIComponent(eid), {
      method: 'POST',
      credentials: 'include',
      headers: makeHeaders(),
      body: JSON.stringify({
        operationName: 'AddShift',
        variables: {
          shiftOpportunityId: { shiftId: opp.shift.id },
        },
        query: mutation,
      }),
    });

    const data = (await response.json()) as {
      data?: { addShift?: unknown };
      errors?: Array<{ message: string }>;
    };

    if (data.errors) {
      const errorStr = JSON.stringify(data.errors).toLowerCase();
      const isTerminal = TERMINAL_ERRORS.some((t) => errorStr.includes(t));

      if (isTerminal) {
        // Terminal error — don't retry
        sendToIsolated('CLAIM_RESULT', {
          oppId: opp.id,
          success: false,
          error: data.errors[0]?.message,
          attempt: 1,
        });
        return;
      }
    }

    // Success
    sendToIsolated('CLAIM_RESULT', {
      oppId: opp.id,
      success: true,
      shift: {
        start: opp.shift.timeRange.start,
        end: opp.shift.timeRange.end,
        duration: opp.shift.duration.value,
        site: opp.shift.site.name,
      },
      attempt: 1,
    });
  } catch (_e) {
    sendToIsolated('CLAIM_RESULT', {
      oppId: opp.id,
      success: false,
      error: 'network-error',
      attempt: 1,
    });
  }
}

// ── Helpers ──

function getNextQuery(): string {
  const query = POLL_QUERIES[currentQueryIndex % POLL_QUERIES.length];
  currentQueryIndex++;
  return query;
}

function getOperationName(): string {
  const names = ['PollShifts', 'GetShiftList', 'QueryOpportunities'];
  return names[currentQueryIndex % names.length];
}

function getQueryRange(): { start: string; end: string } {
  const now = new Date();
  const start = now.toISOString().split('T')[0] + 'T04:00:00.000Z';
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return {
    start,
    end: end.toISOString().split('T')[0] + 'T03:59:59.999Z',
  };
}

function getEmployeeId(): string | null {
  if (cachedEid) {return cachedEid;}

  const pattern = /aza-user-features-(\d+)-prod/;

  try {
    // localStorage
    const lsKey = Object.keys(localStorage).find((k) => pattern.test(k));
    if (lsKey) {
      const match = lsKey.match(pattern);
      if (match) {return match[1];}
    }

    // sessionStorage
    const ssKey = Object.keys(sessionStorage).find((k) => pattern.test(k));
    if (ssKey) {
      const match = ssKey.match(pattern);
      if (match) {return match[1];}
    }

    // Meta tag
    const meta = document.querySelector('meta[name="employee-id"]');
    if (meta) {return meta.getAttribute('content');}
  } catch (_e) {
    // Ignore
  }

  return null;
}

function getCsrf(): string | null {
  const now = Date.now();
  if (cachedCsrf && now - csrfTimestamp < 60000) {
    return cachedCsrf;
  }

  try {
    const m = document.cookie.match(/anti-csrftoken-a2z=([^;]+)/);
    if (m) {
      cachedCsrf = decodeURIComponent(m[1]);
      csrfTimestamp = now;
      return cachedCsrf;
    }

    const el = document.querySelector('meta[name="anti-csrftoken-a2z"]');
    if (el) {
      cachedCsrf = el.getAttribute('content');
      csrfTimestamp = now;
      return cachedCsrf;
    }
  } catch (_e) {
    // Ignore
  }

  return null;
}

function sniffClientId(): string {
  if (extractedClientId) {return extractedClientId;}

  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      const m = text.match(/x-atoz-client-id["']?\s*[:=]\s*["']([^"']+)["']/);
      if (m) {
        extractedClientId = m[1];
        return extractedClientId;
      }
    }

    const win = window as unknown as Record<string, unknown>;
    if (win.__ATOZ_CLIENT_ID) {
      extractedClientId = String(win.__ATOZ_CLIENT_ID);
      return extractedClientId;
    }
  } catch (_e) {
    // Ignore
  }

  return 'SCHEDULE_MANAGEMENT_SERVICE';
}

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-atoz-client-id': sniffClientId(),
    'Referer': window.location.href,
  };

  const csrf = getCsrf();
  if (csrf) {
    headers['anti-csrftoken-a2z'] = csrf;
  }

  return headers;
}

function handleRateLimit(): void {
  if (!rateLimited) {
    rateLimited = true;
    sendToIsolated('RATE_LIMITED', { limited: true, retryAfter: 30 });

    // Auto-recover after 30 seconds
    setTimeout(() => {
      rateLimited = false;
      sendToIsolated('RATE_LIMITED', { limited: false });
    }, 30000);
  }
}

function applyBackoff(): void {
  // Exponential backoff capped at 10 seconds
  const backoff = Math.min(1000 * Math.pow(2, consecutiveErrors), 10000);
  currentConfig.interval = Math.max(currentConfig.interval, backoff);
}

function extractOpportunities(data: unknown): ShiftOpportunity[] {
  if (!data || typeof data !== 'object') {return [];}
  const d = data as Record<string, unknown>;
  const so = d.shiftOpportunities;
  if (!so || typeof so !== 'object') {return [];}
  const opps = (so as Record<string, unknown>).opportunities;
  if (!Array.isArray(opps)) {return [];}
  return opps.filter((o): o is ShiftOpportunity => {
    return (
      o &&
      typeof o === 'object' &&
      typeof (o as ShiftOpportunity).id === 'string' &&
      typeof (o as ShiftOpportunity).type === 'string' &&
      (o as ShiftOpportunity).shift !== null && (o as ShiftOpportunity).shift !== undefined
    );
  });
}

function isBlacklisted(opp: ShiftOpportunity): boolean {
  if (currentConfig.blacklistDates.length === 0) {return false;}
  if (!opp.shift?.timeRange?.start) {return false;}
  const shiftDate = opp.shift.timeRange.start.split('T')[0];
  return currentConfig.blacklistDates.includes(shiftDate);
}

function sendToIsolated(action: string, payload?: unknown): void {
  window.postMessage(
    {
      source: 'sf30-v2-main',
      action,
      payload,
      token: isolatedToken,
    },
    window.location.origin
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Cleanup ──

// Periodic cleanup of claimed IDs to prevent memory growth
cleanupInterval = setInterval(() => {
  if (claimedIds.size > 500) {
    const toKeep = Array.from(claimedIds).slice(-250);
    claimedIds = new Set(toKeep);
  }
}, 300000); // every 5 minutes
