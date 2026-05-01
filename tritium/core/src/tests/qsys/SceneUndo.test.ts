import { cm } from '../setup';
import type { Scene } from '@/wrappers/Scene';
import type { MolCoord } from '@/wrappers/MolCoord';

// Parse getObjectTreeJSON and return the number of object entries (excludes the scene header entry).
function countObjects(scene: Scene): number {
    const entries: unknown[] = JSON.parse(scene.getObjectTreeJSON());
    // First entry is the scene itself (parent: -1); remaining entries are objects/renderers.
    return entries.length - 1;
}

describe('Scene undo/redo round-trip', () => {
    let scene: Scene;

    beforeEach(() => {
        scene = cm.createScene() as Scene;
    });

    it('records addObject in a txn and correctly undoes/redoes it', () => {
        expect(countObjects(scene)).toBe(0);
        expect(scene.isUndoable()).toBe(false);

        // Add a MolCoord object within an undo transaction.
        const mol = cm.createObj('MolCoord') as MolCoord;
        scene.startUndoTxn('add obj');
        scene.addObject(mol);
        scene.commitUndoTxn();

        expect(countObjects(scene)).toBe(1);
        expect(scene.isUndoable()).toBe(true);
        expect(scene.isRedoable()).toBe(false);
        expect(scene.getUndoDesc(0)).toBe('add obj');

        // Undo removes the object.
        expect(scene.undo(0)).toBe(true);
        expect(countObjects(scene)).toBe(0);
        expect(scene.isUndoable()).toBe(false);
        expect(scene.isRedoable()).toBe(true);

        // Redo restores the object.
        expect(scene.redo(0)).toBe(true);
        expect(countObjects(scene)).toBe(1);
        expect(scene.isUndoable()).toBe(true);
        expect(scene.isRedoable()).toBe(false);
    });

    it('does not add to undo stack when no txn is active', () => {
        const mol = cm.createObj('MolCoord') as MolCoord;
        scene.addObject(mol);  // outside any txn
        // addEditInfo is ignored when m_pPendInfo == NULL, so nothing is undoable.
        expect(scene.isUndoable()).toBe(false);
    });

    it('rolls back a txn that fails mid-way', () => {
        const mol = cm.createObj('MolCoord') as MolCoord;
        scene.startUndoTxn('failing txn');
        scene.addObject(mol);
        scene.rollbackUndoTxn();

        // rollbackUndoTxn calls pui->undo() which should remove the object.
        expect(countObjects(scene)).toBe(0);
        expect(scene.isUndoable()).toBe(false);
    });

    it('undo returns false when nothing is undoable', () => {
        expect(scene.isUndoable()).toBe(false);
        expect(scene.undo(0)).toBe(false);
    });

    it('redo returns false when nothing is redoable', () => {
        expect(scene.isRedoable()).toBe(false);
        expect(scene.redo(0)).toBe(false);
    });
});
