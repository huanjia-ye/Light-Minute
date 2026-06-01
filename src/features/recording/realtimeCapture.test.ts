import { RealtimeChunkAssembler, encodeBytesToBase64, encodeFloat32ToPcm16 } from './realtimeCapture';

function createFrame(index: number, hasSpeech = false) {
  const samples = new Float32Array(320).fill(hasSpeech ? 0.12 : 0.002);
  return {
    startMs: index * 20,
    endMs: (index + 1) * 20,
    samples,
    rms: hasSpeech ? 0.045 : 0.002,
    peak: hasSpeech ? 0.18 : 0.008,
  };
}

function createAssembler(sessionId: string) {
  return new RealtimeChunkAssembler({
    sessionId,
    vad: {
      calibrationMs: 20,
      speechStartMs: 20,
      silenceEndMs: 40,
      hangoverMs: 40,
      prerollMs: 0,
    },
  });
}

describe('realtime capture chunk assembler', () => {
  it('encodes pcm16 bytes and base64 payloads', () => {
    const pcmBytes = encodeFloat32ToPcm16(new Float32Array([0, 1, -1]));

    expect(Array.from(pcmBytes)).toEqual([0, 0, 255, 127, 0, 128]);
    expect(encodeBytesToBase64(pcmBytes)).toBe('AAD/fwCA');
  });

  it('emits a normal 200ms chunk after 10 frames', () => {
    const assembler = createAssembler('rt-1');
    const emittedChunks = [];

    for (let index = 0; index < 20; index += 1) {
      const update = assembler.pushFrame(createFrame(index, index >= 15));
      emittedChunks.push(...update.chunks);
    }

    expect(emittedChunks).toHaveLength(2);
    expect(emittedChunks[0].chunk).toMatchObject({
      sessionId: 'rt-1',
      seq: 0,
      startMs: 0,
      endMs: 200,
      hasSpeech: false,
      isLast: false,
    });
    expect(emittedChunks[1].chunk).toMatchObject({
      sessionId: 'rt-1',
      seq: 1,
      startMs: 200,
      endMs: 400,
      hasSpeech: true,
      isLast: false,
    });
  });

  it('flushes the pre-pause tail without marking it as last', () => {
    const assembler = createAssembler('rt-2');

    for (let index = 0; index < 15; index += 1) {
      assembler.pushFrame(createFrame(index, index >= 10));
    }

    const flushed = assembler.flush(false);

    expect(flushed).toHaveLength(1);
    expect(flushed[0].chunk).toMatchObject({
      seq: 1,
      startMs: 200,
      endMs: 300,
      hasSpeech: true,
      isLast: false,
    });
  });

  it('flushes the stop tail as the final chunk', () => {
    const assembler = createAssembler('rt-3');

    for (let index = 0; index < 12; index += 1) {
      assembler.pushFrame(createFrame(index, index >= 6));
    }

    const flushed = assembler.flush(true);

    expect(flushed).toHaveLength(1);
    expect(flushed[0].chunk).toMatchObject({
      seq: 1,
      startMs: 200,
      endMs: 240,
      hasSpeech: true,
      isLast: true,
    });
  });

  it('creates an empty final chunk when stop happens with no buffered audio', () => {
    const assembler = createAssembler('rt-4');

    const flushed = assembler.flush(true);

    expect(flushed).toHaveLength(1);
    expect(flushed[0].chunk).toMatchObject({
      seq: 0,
      startMs: 0,
      endMs: 0,
      hasSpeech: false,
      isLast: true,
    });
    expect(flushed[0].payloadBase64).toBe('');
  });

  it('resets voice state for resume without rewinding chunk sequence', () => {
    const assembler = createAssembler('rt-5');

    for (let index = 0; index < 21; index += 1) {
      assembler.pushFrame(createFrame(index, index >= 15));
    }

    expect(assembler.getCurrentVoiceState()).toBe('speech');

    assembler.resetForResume();
    expect(assembler.getCurrentVoiceState()).toBe('unknown');

    for (let index = 21; index < 31; index += 1) {
      assembler.pushFrame(createFrame(index, index >= 27));
    }

    const finalChunk = assembler.flush(true);
    expect(finalChunk[0].chunk.seq).toBe(3);
  });

  it('holds preroll frames until speech starts and marks the leading audio chunk as speech', () => {
    const assembler = new RealtimeChunkAssembler({
      sessionId: 'rt-preroll',
      vad: {
        calibrationMs: 20,
        speechStartMs: 20,
        silenceEndMs: 40,
        hangoverMs: 40,
        prerollMs: 60,
      },
    });

    const emittedChunks = [];
    for (let index = 0; index < 12; index += 1) {
      const update = assembler.pushFrame(createFrame(index, false));
      emittedChunks.push(...update.chunks);
    }

    expect(emittedChunks).toHaveLength(0);

    for (let index = 12; index < 15; index += 1) {
      const update = assembler.pushFrame(createFrame(index, true));
      emittedChunks.push(...update.chunks);
    }

    expect(emittedChunks).toHaveLength(1);
    expect(emittedChunks[0].chunk).toMatchObject({
      sessionId: 'rt-preroll',
      seq: 0,
      startMs: 0,
      endMs: 200,
      hasSpeech: true,
      isLast: false,
    });
  });

  it('flushes a force-boundary chunk when speech reaches maxUtteranceMs mid-utterance', () => {
    const assembler = new RealtimeChunkAssembler({
      sessionId: 'rt-force-boundary',
      vad: {
        calibrationMs: 20,
        speechStartMs: 20,
        silenceEndMs: 40,
        hangoverMs: 40,
        prerollMs: 0,
        maxUtteranceMs: 100,
      },
    });

    assembler.pushFrame(createFrame(0, false));

    const emittedChunks = [];
    for (let index = 1; index <= 5; index += 1) {
      const update = assembler.pushFrame(createFrame(index, true));
      emittedChunks.push(...update.chunks);
    }

    expect(emittedChunks).toHaveLength(1);
    expect(emittedChunks[0].chunk).toMatchObject({
      sessionId: 'rt-force-boundary',
      seq: 0,
      startMs: 0,
      endMs: 120,
      hasSpeech: true,
      isLast: false,
      boundaryReason: 'force',
    });
  });
});
