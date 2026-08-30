/**
 * @file worker/server/services/app/app.service.ts
 * @description Application-level services: the registry entry.
 *
 * What the app asks the worker about itself -- its build info, the log lines
 * it has buffered, and the orderly stop it performs on the way out.
 */

import { appInfo } from './appInfo';
import { drainLogMessages } from './drainLogMessages';
import { cancelAllJobs } from './shutdown';

export const services = {
    appInfo,
    drainLogMessages,
    cancelAllJobs,
};

export type * from './appInfo';
export type * from './drainLogMessages';
export type * from './shutdown';
