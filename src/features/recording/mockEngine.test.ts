import { mockRecordingEngine } from './mockEngine';

describe('mock recording engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    void mockRecordingEngine.stop();
    vi.useRealTimers();
  });

  it('streams transcript segments and elapsed time', async () => {
    const onSegment = vi.fn();
    const onTick = vi.fn();

    mockRecordingEngine.start({ onSegment, onTick });

    vi.advanceTimersByTime(1600);
    vi.advanceTimersByTime(1000);

    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalled();

    mockRecordingEngine.pause();
    vi.advanceTimersByTime(3000);
    expect(onSegment).toHaveBeenCalledTimes(1);

    mockRecordingEngine.resume();
    vi.advanceTimersByTime(1600);
    expect(onSegment).toHaveBeenCalledTimes(2);

    const snapshot = await mockRecordingEngine.stop();
    expect(snapshot.emittedCount).toBeGreaterThanOrEqual(2);
  });
});
