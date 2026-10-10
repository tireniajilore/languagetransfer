import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { CreateSessionFn, LiveApiError, LiveSessionClient } from '../liveClient';

const OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

function clientWith(createFn: CreateSessionFn): LiveSessionClient {
  return new LiveSessionClient({ apiKey: 'sk-test', createFn });
}

describe('LiveSessionClient.createSession', () => {
  it('sends the documented request shape and maps the response', async () => {
    const createFn = vi.fn(async () => ({
      session: { id: 'live_abc123' },
      transport: { sdp: 'v=0\r\nanswer' },
    }));
    const client = clientWith(createFn);
    const created = await client.createSession({
      offerSdp: OFFER_SDP,
      instructions: 'teach!',
      model: 'gpt-live-1',
    });
    // Exact contract per the verified API: { session: {...}, transport: { type: 'webrtc', sdp } }
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledWith({
      session: { model: 'gpt-live-1', instructions: 'teach!' },
      transport: { type: 'webrtc', sdp: OFFER_SDP },
    });
    expect(created.sessionId).toBe('live_abc123');
    expect(created.answerSdp).toBe('v=0\r\nanswer');
    expect(created.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects an implausibly short SDP without calling the API', async () => {
    const createFn = vi.fn();
    const client = clientWith(createFn);
    await expect(
      client.createSession({ offerSdp: 'too-short', instructions: '', model: 'gpt-live-1' }),
    ).rejects.toThrow(LiveApiError);
    expect(createFn).not.toHaveBeenCalled();
  });

  it('maps 401/403 to non-retryable misconfiguration errors', async () => {
    const client = clientWith(async () => {
      throw new OpenAI.APIError(401, { message: 'bad key' } as never, 'unauthorized', new Headers());
    });
    const err = await client
      .createSession({ offerSdp: OFFER_SDP, instructions: '', model: 'gpt-live-1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LiveApiError);
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(401);
  });

  it('maps 429 and 5xx to retryable errors', async () => {
    for (const status of [429, 500, 503]) {
      const client = clientWith(async () => {
        throw new OpenAI.APIError(status, { message: 'x' } as never, 'err', new Headers());
      });
      const err = await client
        .createSession({ offerSdp: OFFER_SDP, instructions: '', model: 'gpt-live-1' })
        .catch((e) => e);
      expect(err.retryable).toBe(true);
      expect(err.status).toBe(status);
    }
  });

  it('rejects malformed responses as retryable', async () => {
    const client = clientWith(async () => ({ session: { id: '' }, transport: { sdp: '' } }));
    const err = await client
      .createSession({ offerSdp: OFFER_SDP, instructions: '', model: 'gpt-live-1' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(LiveApiError);
    expect(err.retryable).toBe(true);
  });

  it('maps network failures to retryable errors', async () => {
    const client = clientWith(async () => {
      throw new Error('socket hang up');
    });
    const err = await client
      .createSession({ offerSdp: OFFER_SDP, instructions: '', model: 'gpt-live-1' })
      .catch((e) => e);
    expect(err.retryable).toBe(true);
  });
});
