/**
 * Copy/paste round trip of an object that carries a preset renderer group.
 *
 * The clipboard serializes an object with StreamManager.toXML and restores it
 * with fromXML + Scene.addObject (see react-gui's clipboard worker services).
 * Two things went wrong with a preset group in that payload, and this pins
 * both at the addon level, against the real C++:
 *
 * - createPresetRenderer named its group with the direct C++ setter, which
 *   leaves the name property flagged as default -- and default-valued props
 *   are not serialized. The group came back from XML nameless.
 * - addObject re-applies styles, which reads the group's center; a nameless
 *   group's member scan (group property == own name) matched the group
 *   itself and recursed until the stack ran out. Pasting crashed the app.
 */
import { cm } from '../setup';
import type { Scene } from '@/wrappers/Scene';
import type { MolCoord } from '@/wrappers/MolCoord';
import type { StreamManager } from '@/wrappers/StreamManager';

function rendListOf(o: any): { type: string; name: string; group: string }[] {
    const out = [];
    for (let i = 0; i < o.getRendCount(); i++) {
        const r = o.getRendererByIndex(i);
        out.push({ type: r.type_name, name: r.name, group: r.group });
    }
    return out.sort((a, b) => a.type.localeCompare(b.type));
}

describe('object clipboard XML round trip', () => {
    it('a preset renderer group survives toXML / fromXML / addObject', () => {
        const strMgr = cm.getService('StreamManager') as StreamManager;

        // Source: 1CRN with the Simple1 preset (a *group plus two children).
        const scene1 = cm.createScene() as Scene;
        const reader = strMgr.createHandler('pdb', 0) as any;
        reader.setPath(process.cwd() + '/../../tests/test_data/1CRN.pdb');
        const mol = cm.createObj('MolCoord') as MolCoord;
        reader.attach(mol);
        reader.read();
        reader.detach();
        mol.name = '1CRN';
        scene1.addObject(mol);
        const grp = (mol as any).createPresetRenderer(
            'Simple1RendPreset', 'simple1', 'simple1');
        expect(grp).toBeTruthy();

        const xml = strMgr.toXML(mol as any);
        expect(xml).toBeTruthy();

        // Paste into a brand-new scene, exactly as pasteNode does.
        const scene2 = cm.createScene() as Scene;
        scene2.startUndoTxn('Paste object');
        const restored = strMgr.fromXML(xml as any, scene2.uid) as any;
        expect(restored).toBeTruthy();
        restored.name = '1CRN';
        // This call crashed on stack overflow while the group was nameless.
        const newId = scene2.addObject(restored);
        scene2.commitUndoTxn();
        expect(newId).toBeTruthy();

        // The group kept its name, so its members still resolve to it.
        expect(rendListOf(restored)).toEqual(rendListOf(mol));
        expect(rendListOf(restored)).toEqual([
            { type: '*group', name: 'simple1', group: '' },
            { type: 'simple', name: 'simple1simple', group: 'simple1' },
            { type: 'trace', name: 'simple1trace', group: 'simple1' },
        ]);
    });
});
