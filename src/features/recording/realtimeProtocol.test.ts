import { createSessionStartMessage, parseRealtimeIncomingMessage } from './realtimeProtocol';

describe('realtime protocol helpers', () => {
  it('builds a v1 session.start message with stable defaults', () => {
    const message = createSessionStartMessage({
      sessionId: 'rt-1',
      language: 'zh-CN',
      engineMode: 'local-whisper-stream',
    });

    expect(message.protocolVersion).toBe('v1');
    expect(message.audioFormat.clientChunkMs).toBe(200);
    expect(message.session.language).toBe('zh-CN');
  });

  it('parses supported incoming adapter messages', () => {
    const parsed = parseRealtimeIncomingMessage(
      JSON.stringify({
        type: 'session.rejected',
        sessionId: 'rt-1',
        transportStatus: 'open',
        reason: {
          code: 'backend_unavailable',
          message: 'not ready',
          recoverable: true,
        },
      }),
    );

    expect(parsed?.type).toBe('session.rejected');
  });

  it('parses transport.metrics messages with realtime diagnostics', () => {
    const parsed = parseRealtimeIncomingMessage(
      JSON.stringify({
        type: 'transport.metrics',
        sessionId: 'rt-1',
        lastAcceptedSeq: 14,
        queueDepth: 1,
        bufferedMs: 400,
        lastPartialAudioMs: 2000,
        lastPartialInferenceMs: 4100,
        lastPartialEmitLatencyMs: 2500,
        stalePartialDropCount: 3,
        lastFinalizeReason: 'force',
        lastFinalAudioMs: 5000,
        lastFinalInferenceMs: 8600,
        lastFinalEmitLatencyMs: 3600,
      }),
    );

    expect(parsed?.type).toBe('transport.metrics');
  });

  it('returns null for invalid payloads', () => {
    expect(parseRealtimeIncomingMessage('{bad json')).toBeNull();
    expect(parseRealtimeIncomingMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });
});
