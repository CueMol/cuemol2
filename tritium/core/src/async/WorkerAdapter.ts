export interface WorkerAdapter {
    postMessage(data: any[], xfer?: any): void;
    onMessage(handler: (data: any[]) => void): void;
    terminate(): void;
}
