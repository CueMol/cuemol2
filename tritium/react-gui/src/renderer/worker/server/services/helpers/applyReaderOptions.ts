/**
 * @file worker/server/services/helpers/applyReaderOptions.ts
 * @description Apply the file-open dialog's format-specific options onto a
 * freshly created ObjReader, before read(). This is the worker-side
 * equivalent of the UXP `fopen-*opt-page` `ondlgok` handlers
 * (uxp_gui/cuemol2/base/content/fopen-{pdb,mmcif,mtz,ccp4map,msms,namdcoor}opt-page),
 * which assign dialog values directly onto reader properties.
 *
 * Runs in the Web Worker thread (sync C++ wrappers, no await).
 *
 * @remarks Reader properties live on concrete reader subclasses (PDBFileReader,
 * MTZ2MapReader, ...) and are not present on the generated `ObjReader` TS type,
 * so each assignment casts through `unknown` per the CLAUDE.md duck-typing rule.
 * The mapping is keyed on the resolved reader `nickname` (not the dialog's
 * extension-guessed `format.kind`) so it stays correct if the two diverge; the
 * `format.kind` guard makes a mismatch a safe no-op.
 */
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { FormatOptions } from '../../../../components/fopen-opt-dlgs/types';

// Narrow the reader to an indexable bag so subclass properties / setSubPath
// can be assigned without the generated type complaining.
type ReaderBag = Record<string, unknown> & {
    setSubPath?: (key: string, path: string) => void;
};

/**
 * Apply `format` onto `reader` according to the resolved reader `nickname`.
 * No-op when `format.kind` is 'unknown' or does not correspond to `nickname`.
 *
 * @param reader - the reader handler created by StreamManager.createHandler
 * @param nickname - resolved reader nickname (pdb / mmcif / mtzmap / ...)
 * @param format - the dialog's format-specific options (discriminated union)
 */
export function applyReaderOptions(
    reader: ObjReader,
    nickname: string,
    format: FormatOptions,
): void {
    const r = reader as unknown as ReaderBag;

    switch (nickname) {
        case 'pdb': {
            if (format.kind !== 'pdb') return;
            const o = format.options;
            r.loadmodel = o.loadModel;
            r.loadanisou = o.loadAnisou;
            r.loadaltconf = o.loadAltConf;
            r.loadsegid = o.loadSegid;
            r.build2ndry = o.build2ndry;
            r.autoTopoGen = o.autoTopology;
            return;
        }
        case 'mmcif': {
            if (format.kind !== 'mmcif') return;
            const o = format.options;
            r.loadmodel = o.loadModel;
            r.loadanisou = o.loadAnisou;
            r.loadaltconf = o.loadAltConf;
            r.autoTopoGen = o.autoTopology;
            // mmcif reader has `loadsecstr` (load 2ndry from file) instead of
            // `build2ndry` (recompute), and no `loadsegid`. UXP wires
            // loadsecstr = !calc_2ndry, so build2ndry (recompute) inverts.
            r.loadsecstr = !o.build2ndry;
            return;
        }
        case 'mtzmap': {
            if (format.kind !== 'mtz') return;
            const o = format.options;
            r.clmn_F = o.columnF;
            // UXP gates phase / weight on their checkbox; unchecked -> empty
            // string, which the reader treats as "unset".
            r.clmn_PHI = o.phaseEnabled ? o.columnPhi : '';
            r.clmn_WT = o.weightEnabled ? o.columnW : '';
            r.resolution = o.resolutionLimit;
            r.gridsize = o.gridSpacing;
            return;
        }
        case 'ccp4map': {
            if (format.kind !== 'ccp4map') return;
            const o = format.options;
            r.normalize = o.normalize;
            r.truncate_min = o.truncateMinEnabled;
            r.min = o.truncateMin;
            r.truncate_max = o.truncateMaxEnabled;
            r.max = o.truncateMax;
            return;
        }
        case 'msms': {
            if (format.kind !== 'msms') return;
            const o = format.options;
            if (o.vertFilePath) r.vertex_file = o.vertFilePath;
            return;
        }
        case 'namdcoor': {
            if (format.kind !== 'namdcoor') return;
            const o = format.options;
            // PSF topology is a sub-stream keyed 'topo' (NAMDCoorReader
            // createInStream("topo")); UXP wires it via setSubPath.
            if (o.psfFilePath && typeof r.setSubPath === 'function') {
                r.setSubPath('topo', o.psfFilePath);
            }
            return;
        }
        case 'amberprm': {
            if (format.kind !== 'amberprm') return;
            const o = format.options;
            // AMBER coordinates (inpcrd / rst7 / restrt) are an optional
            // sub-stream keyed 'coord' (AmberPrmtopReader createInStream("coord")).
            // Empty -> topology-only load.
            if (o.coordFilePath && typeof r.setSubPath === 'function') {
                r.setSubPath('coord', o.coordFilePath);
            }
            return;
        }
        default:
            // Unknown / option-less format: nothing to wire.
            return;
    }
}
