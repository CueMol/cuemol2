import type { WorkerContext } from '../types/WorkerContext';

export const name = 'appInfo';

export interface AppInfoResult {
  version: string;
  build: string;
}

export default function appInfo(ctx: WorkerContext): AppInfoResult {
  return {
    version: ctx.sceMgr.version,
    build: ctx.sceMgr.build,
  };
}
