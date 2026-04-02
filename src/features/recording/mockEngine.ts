import type { TranscriptSegment } from '../../types/meeting';
import { buildMockRecordingScript } from './mockScript';
import type { RecordingEngine } from './engineTypes';

interface EngineCallbacks {
  onSegment: (segment: TranscriptSegment) => void;
  onTick: (elapsedSeconds: number) => void;
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
  private callbacks: EngineCallbacks | null = null;

  isSupported() {
    return true;
  }

  start(callbacks: EngineCallbacks) {
    this.reset();
    this.state = 'recording';
    this.callbacks = callbacks;
    this.script = buildMockRecordingScript();
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
      this.callbacks?.onSegment(nextSegment);
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
  }
}

export const mockRecordingEngine = new MockRecordingEngine();
