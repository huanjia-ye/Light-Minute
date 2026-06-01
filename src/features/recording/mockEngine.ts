import type { TranscriptSegment } from '../../types/meeting';
import { buildMockRecordingScript } from './mockScript';
import type { RecordingEngine, RecordingEngineCallbacks, RecordingEngineStartOptions } from './engineTypes';

function emitFinalSegment(
  callbacks: RecordingEngineCallbacks,
  sessionId: string,
  segment: TranscriptSegment,
) {
  if (callbacks.onAsrEvent) {
    callbacks.onAsrEvent({
      type: 'final',
      sessionId,
      groupId: segment.id,
      utteranceId: segment.id,
      revision: 1,
      startMs: segment.startTime * 1000,
      endMs: segment.endTime * 1000,
      text: segment.text,
    });
    return;
  }

  callbacks.onSegment?.(segment);
}

type EngineState = 'idle' | 'recording' | 'paused';

class MockRecordingEngine implements RecordingEngine {
  readonly mode = 'mock' as const;
  private state: EngineState = 'idle';
  private elapsedSeconds = 0;
  private cursor = 0;
  private tickTimer: number | null = null;
  private segmentTimer: number | null = null;
  private script: TranscriptSegment[] = [];
  private callbacks: RecordingEngineCallbacks | null = null;
  private sessionId = 'mock-session';

  isSupported() {
    return true;
  }

  async start(options: RecordingEngineStartOptions) {
    this.reset();
    this.state = 'recording';
    this.callbacks = options.callbacks;
    this.sessionId = options.sessionId;
    this.script = buildMockRecordingScript();
    this.callbacks.onMicStatus?.('ready');
    this.callbacks.onVoiceState?.('silence');
    this.startTicking();
    this.scheduleSegment();
  }

  pause() {
    if (this.state !== 'recording') {
      return;
    }

    this.state = 'paused';
    this.clearSegmentTimer();
    this.clearTickTimer();
  }

  resume() {
    if (this.state !== 'paused') {
      return;
    }

    this.state = 'recording';
    this.startTicking();
    this.scheduleSegment();
  }

  async stop() {
    const snapshot = {
      elapsedSeconds: this.elapsedSeconds,
      emittedCount: this.cursor,
      mode: this.mode,
    };

    this.reset();
    return snapshot;
  }

  private startTicking() {
    this.clearTickTimer();
    this.tickTimer = window.setInterval(() => {
      this.elapsedSeconds += 1;
      this.callbacks?.onTick(this.elapsedSeconds);
    }, 1000);
  }

  private scheduleSegment() {
    this.clearSegmentTimer();

    if (this.state !== 'recording' || this.cursor >= this.script.length) {
      return;
    }

    this.segmentTimer = window.setTimeout(() => {
      if (this.state !== 'recording') {
        return;
      }

      const nextSegment = this.script[this.cursor];
      if (this.callbacks) {
        emitFinalSegment(this.callbacks, this.sessionId, nextSegment);
      }
      this.cursor += 1;
      this.scheduleSegment();
    }, 1500);
  }

  private clearTickTimer() {
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private clearSegmentTimer() {
    if (this.segmentTimer) {
      window.clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
  }

  private reset() {
    this.clearTickTimer();
    this.clearSegmentTimer();
    this.state = 'idle';
    this.elapsedSeconds = 0;
    this.cursor = 0;
    this.script = [];
    this.callbacks = null;
    this.sessionId = 'mock-session';
  }
}

export const mockRecordingEngine = new MockRecordingEngine();
