/**
 * @file renderer/worker/testing/index.ts
 * @description Worker-service test harness: fake wrapper objects plus a
 * `WorkerContext` factory. Import from '@renderer/worker/testing' in
 * `*.test.ts` only -- ESLint rejects it anywhere else.
 */

export {
    allocUid, resetFakeUids,
    fakeRenderer, fakeObject, fakeView, fakeCamera, fakeScene,
} from './fakes';
export type {
    CallLog,
    FakeRenderer, FakeRendererOptions,
    FakeObject, FakeObjectOptions,
    FakeView, FakeViewOptions,
    FakeCamera, FakeCameraOptions,
    FakeScene, FakeSceneOptions, FakeUndoLog,
} from './fakes';
export { makeWorkerCtx } from './makeWorkerCtx';
export type { WorkerCtxOptions, FakeWorkerCtx, FakeReaderInfo, FakeSceneManager } from './makeWorkerCtx';
