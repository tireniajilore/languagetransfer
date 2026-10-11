import { describe, expect, it } from 'vitest';
import { resolveLearnerIdentity } from '../learnerIdentity';

const secret = 'a-long-random-secret-at-least-thirty-two-characters';

describe('anonymous learner capability', () => {
  it('restores the same learner only with a valid signed token', () => {
    const fresh = resolveLearnerIdentity(undefined, secret);
    expect(fresh.token).toMatch(/^lt1\./);
    expect(resolveLearnerIdentity(fresh.token, secret)).toEqual(fresh);
  });

  it('rejects tampering, a mismatched signing key, and raw learner IDs', () => {
    const a = resolveLearnerIdentity(undefined, secret);
    expect(resolveLearnerIdentity(a.learnerId, secret).learnerId).not.toBe(a.learnerId);
    expect(resolveLearnerIdentity(a.token, 'different-secret').learnerId).not.toBe(a.learnerId);
    const altered = a.token.slice(0, -1) + (a.token.endsWith('a') ? 'b' : 'a');
    expect(resolveLearnerIdentity(altered, secret).learnerId).not.toBe(a.learnerId);
  });
});
