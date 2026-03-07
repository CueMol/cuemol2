import { jest } from '@jest/globals';
import { cm } from '../setup';
import type { ScrEventManager } from '@/wrappers/ScrEventManager';
import type { MsgLog } from '@/wrappers/MsgLog';

describe('NapiCallBackObj', () => {
  let sem: ScrEventManager;
  let msglog: MsgLog;
  let listenerId: number | null = null;
  let slotIds: number[] = [];

  beforeEach(() => {
    sem = cm.getService('ScrEventManager') as ScrEventManager;
    msglog = cm.getService('MsgLog') as MsgLog;
    // Disable accumulation mode so that writeLog fires events to listeners
    msglog.removeAccumMsg();
    listenerId = null;
    slotIds = [];
  });

  afterEach(() => {
    slotIds.forEach(id => sem.remove(id));
    slotIds = [];
    if (listenerId !== null) {
      sem.removeListener(listenerId);
      listenerId = null;
    }
  });

  it('can pass a JS function to addListener', () => {
    listenerId = sem.addListener(jest.fn());
    expect(typeof listenerId).toBe('number');
  });

  it('invokes callback when MsgLog.writeln() is called', () => {
    const callback = jest.fn();
    listenerId = sem.addListener(callback);
    const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);
    slotIds.push(slotId);

    msglog.writeln('test callback invocation');

    expect(callback).toHaveBeenCalled();
  });

  it('passes correct arguments to callback', () => {
    const callback = jest.fn();
    listenerId = sem.addListener(callback);
    const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);
    slotIds.push(slotId);
    const semLogValue = sem.SEM_LOG;
    const semAddedValue = sem.SEM_ADDED;

    msglog.writeln('args test');

    expect(callback).toHaveBeenCalledWith(
      slotId,                // arg[0]: slotId
      "log",                 // arg[1]: category
      semLogValue,           // arg[2]: targetType
      semAddedValue,         // arg[3]: eventType
      0,                     // arg[4]: srcUID
      expect.any(String)     // arg[5]: event JSON
    );
  });

  it('does not invoke callback after remove(slotId)', () => {
    const callback = jest.fn();
    listenerId = sem.addListener(callback);
    const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);

    sem.remove(slotId);
    msglog.writeln('after slot removal');

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not invoke callback after removeListener', () => {
    const callback = jest.fn();
    listenerId = sem.addListener(callback);
    const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);
    slotIds.push(slotId);

    sem.removeListener(listenerId!); // NapiCallBackObj is destroyed
    listenerId = null;
    msglog.writeln('after removeListener');

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not crash after 100 addListener/removeListener cycles', () => {
    for (let i = 0; i < 100; i++) {
      const callback = jest.fn();
      const id = sem.addListener(callback);
      const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);
      msglog.writeln(`iteration ${i}`);
      expect(callback).toHaveBeenCalled();
      sem.remove(slotId);
      sem.removeListener(id);
    }
  });

  it('does not crash when gc() is called after removeListener', () => {
    const callback = jest.fn();
    const id = sem.addListener(callback);
    const slotId = sem.append("log", sem.SEM_LOG, sem.SEM_ADDED, -1);
    sem.remove(slotId);
    sem.removeListener(id);

    // Force GC if available (requires --expose-gc flag)
    if (typeof (global as any).gc === 'function') {
      (global as any).gc();
    }
    expect(true).toBe(true);
  });
});
