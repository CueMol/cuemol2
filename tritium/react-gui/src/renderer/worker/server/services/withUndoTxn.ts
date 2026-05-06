import type { Scene } from '@cuemol/core/src/wrappers/Scene';

export function withUndoTxn<T>(scene: Scene, label: string, fn: () => T): T {
    scene.startUndoTxn(label);
    try {
        const result = fn();
        scene.commitUndoTxn();
        return result;
    } catch (e) {
        scene.rollbackUndoTxn();
        throw e;
    }
}
