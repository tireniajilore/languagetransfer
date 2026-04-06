'use client';

const SESSION_ID_KEY = 'voiceai.session_id';
const VISIT_COUNT_KEY = 'voiceai.visit_count';
const VISIT_TRACKED_KEY = 'voiceai.visit_tracked';
const ATTRIBUTION_KEY = 'voiceai.attribution';
const EVENT_KEY_PREFIX = 'voiceai.event.';

export interface ClientAttribution {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface ClientSessionContext extends ClientAttribution {
  sessionId: string;
  visitCount: number;
  isReturning: boolean;
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readAttributionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    referrer: document.referrer || undefined,
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined
  };
}

function loadStoredAttribution(): ClientAttribution {
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    return raw ? JSON.parse(raw) as ClientAttribution : {};
  } catch {
    return {};
  }
}

function storeAttribution(attribution: ClientAttribution) {
  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
}

export function getClientSessionContext(): ClientSessionContext | null {
  if (typeof window === 'undefined') return null;

  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = createSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }

  const currentVisitTracked = sessionStorage.getItem(VISIT_TRACKED_KEY) === 'true';
  const existingVisitCount = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) ?? '0', 10) || 0;
  const visitCount = currentVisitTracked ? existingVisitCount : existingVisitCount + 1;

  if (!currentVisitTracked) {
    localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));
    sessionStorage.setItem(VISIT_TRACKED_KEY, 'true');
  }

  const storedAttribution = loadStoredAttribution();
  const urlAttribution = readAttributionFromUrl();
  const mergedAttribution: ClientAttribution = {
    referrer: storedAttribution.referrer || urlAttribution.referrer,
    utmSource: urlAttribution.utmSource || storedAttribution.utmSource,
    utmMedium: urlAttribution.utmMedium || storedAttribution.utmMedium,
    utmCampaign: urlAttribution.utmCampaign || storedAttribution.utmCampaign
  };

  storeAttribution(mergedAttribution);

  return {
    sessionId,
    visitCount,
    isReturning: visitCount > 1,
    ...mergedAttribution
  };
}

export function hasTrackedEvent(key: string) {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(`${EVENT_KEY_PREFIX}${key}`) === 'true';
}

export function markTrackedEvent(key: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(`${EVENT_KEY_PREFIX}${key}`, 'true');
}
