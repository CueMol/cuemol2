// Browser Web Worker for CueMol (runs with nodeIntegrationInWorker: true)
// Equivalent of core/src/async/worker.ts but uses browser Web Worker API

import { WorkerService } from '@cuemol/core/src/async/WorkerService'

const svc = new WorkerService(
    (data: any[]) => self.postMessage(data),
    () => self.close()
)

self.onmessage = (event: MessageEvent) => {
    const method: string = event.data[0]
    const seqno: number = event.data[1]
    const args: any[] = event.data.slice(2)
    svc.invoke(method, seqno, args)
}
