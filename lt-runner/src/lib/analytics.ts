'use client';

import { getClientSessionContext, hasTrackedEvent, markTrackedEvent } from '@/lib/session';

export type AnalyticsEventName =
  | 'landing_viewed'
  | 'lesson_started'
  | 'lesson_progress_25'
  | 'lesson_progress_50'
  | 'lesson_progress_75'
  | 'lesson_completed'
  | 'outro_prompt_reached'
  | 'demand_card_viewed'
  | 'demand_submitted';

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

const pendingEventKeys = new Set<string>();

async function postAnalytics(payload: object): Promise<boolean> {
  const body = JSON.stringify(payload);

  try {
    const response = await fetch('/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body,
      keepalive: true
    });

    return response.ok;
  } catch {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' });
      return navigator.sendBeacon('/api/analytics', blob);
    }

    return false;
  }
}

export function trackEvent(event: AnalyticsEventName, properties: AnalyticsPayload = {}) {
  const context = getClientSessionContext();
  if (!context) return Promise.resolve(false);

  return postAnalytics({
    event,
    sessionId: context.sessionId,
    properties: {
      path: window.location.pathname,
      visitCount: context.visitCount,
      isReturning: context.isReturning,
      referrer: context.referrer ?? null,
      utmSource: context.utmSource ?? null,
      utmMedium: context.utmMedium ?? null,
      utmCampaign: context.utmCampaign ?? null,
      ...properties
    }
  });
}

export function trackEventOnce(key: string, event: AnalyticsEventName, properties: AnalyticsPayload = {}) {
  if (hasTrackedEvent(key) || pendingEventKeys.has(key)) return;

  pendingEventKeys.add(key);

  void trackEvent(event, properties)
    .then((delivered) => {
      if (delivered) {
        markTrackedEvent(key);
      }
    })
    .finally(() => {
      pendingEventKeys.delete(key);
    });
}
