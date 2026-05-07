// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';

export interface AppInfoResult {
  version: string;
  build: string;
}

function appInfo(ctx: WorkerContext): AppInfoResult {
  return {
    version: ctx.sceMgr.version,
    build: ctx.sceMgr.build,
  };
}

export const services = { appInfo };
