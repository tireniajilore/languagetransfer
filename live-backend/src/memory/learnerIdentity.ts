/**
 * Anonymous, possession-based learner identity for the experimental tutor.
 * These tokens are not login accounts. Never accept a raw caller-supplied
 * learnerId: only an HMAC-verified token can restore persistent learner data.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export interface LearnerIdentity {
  learnerId: string;
  token: string;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function resolveLearnerIdentity(candidate: unknown, secret: string): LearnerIdentity {
  if (typeof candidate === 'string' && candidate.length < 256) {
    const match = /^lt1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(candidate);
    if (match) {
      const data = `lt1.${match[1]}`;
      const expected = Buffer.from(sign(data, secret));
      const provided = Buffer.from(match[2]);
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
        return { learnerId: match[1], token: candidate };
      }
    }
  }
  // Invalid/unknown tokens get a fresh anonymous identity, never access to
  // another learner's persisted evidence.
  const learnerId = randomUUID();
  const data = `lt1.${learnerId}`;
  return { learnerId, token: `${data}.${sign(data, secret)}` };
}
