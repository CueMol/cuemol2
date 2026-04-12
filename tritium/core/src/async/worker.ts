import { parentPort } from 'worker_threads';

// NOTE: .ts extension required — Node.js ESM native TS execution
// @ts-expect-error TS5097: allowImportingTsExtensions not enabled
import { WorkerService } from './WorkerService.ts';

const svc = new WorkerService(
    (data: any[]) => parentPort?.postMessage(data),
    () => parentPort?.close()
);

parentPort?.on('message', (data: any) => {
    const method: string = data[0];
    const seqno: number = data[1];
    const args: any[] = data.slice(2);
    svc.invoke(method, seqno, args);
});
