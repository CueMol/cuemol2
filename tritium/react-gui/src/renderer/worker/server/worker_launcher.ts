import { WorkerService } from './WorkerService';
import { registerAllServices } from './services';

const svc = new WorkerService(
    (data: any[]) => self.postMessage(data),
    () => self.close()
);

registerAllServices(svc);

self.onmessage = (event: MessageEvent) => {
    const method: string = event.data[0];
    const seqno: number = event.data[1];
    const args: any[] = event.data.slice(2);
    svc.invoke(method, seqno, args);
};
