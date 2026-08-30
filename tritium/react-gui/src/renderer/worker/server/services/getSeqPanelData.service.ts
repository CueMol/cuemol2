/**
 * @file services/getSeqPanelData.service.ts
 * @description Bulk seq panel data fetch -- one IPC round trip for
 * either the entire scene or a single mol.
 *
 * UXP `bottom-panels/seqpanel.js` calls `mol.getChainsJSON()` +
 * `chain.getResidsJSON()` synchronously per chain. In tritium each of
 * those crosses the worker boundary; with N mols and M chains/mol the
 * naive per-call fan-out becomes (1 + N + N*M) postMessage round trips
 * which is too slow for click->highlight latency. This service folds
 * the iteration into a single worker-side loop using sync C++ calls,
 * so the renderer only sees one round trip per refresh.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object'
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord'
import type { MolChain } from '@cuemol/core/src/wrappers/MolChain'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { parseSceneTreeJSON, type SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes'
import type { MolResidueEntry } from './getMolStructure.service'

export interface GetSeqPanelDataArgs {
    sceneId: number
    /**
     * Optional filter -- when given, only mols whose uid is in this
     * list are returned. The SEM_PROPCHG `sel` handler uses this to
     * refresh just the toggled mol's rows.
     */
    molIds?: number[]
}

export interface SeqPanelRow {
    molUid: number
    molName: string
    chainName: string
    residues: MolResidueEntry[]
}

export interface GetSeqPanelDataResult {
    rows: SeqPanelRow[]
}

function isMolCoordLike(obj: CueMolObject | null): obj is MolCoord {
    if (!obj) return false
    const candidate = obj as unknown as { getChainsJSON?: unknown }
    return typeof candidate.getChainsJSON === 'function'
}

function collectObjectNodes(scene: Scene): SceneTreeNode[] {
    let json: string
    try {
        json = scene.getSceneDataJSON()
    } catch {
        return []
    }
    const tree = parseSceneTreeJSON(json)
    if (!tree) return []
    return tree.children.filter((n) => n.type === 'object')
}

function parseChainNames(json: string): string[] {
    let parsed: unknown
    try {
        parsed = JSON.parse(json)
    } catch {
        return []
    }
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    for (const entry of parsed) {
        if (typeof entry === 'string') out.push(entry)
        else if (entry && typeof (entry as { name?: unknown }).name === 'string') {
            out.push((entry as { name: string }).name)
        }
    }
    return out
}

interface RawResidueEntry {
    name?: unknown
    single?: unknown
    index?: unknown
    sel?: unknown
}

function parseResidues(json: string): MolResidueEntry[] {
    let parsed: unknown
    try {
        parsed = JSON.parse(json)
    } catch {
        return []
    }
    if (!Array.isArray(parsed)) return []
    const out: MolResidueEntry[] = []
    for (const raw of parsed as RawResidueEntry[]) {
        const index = typeof raw?.index === 'string' ? raw.index : String(raw?.index ?? '')
        if (!index) continue
        out.push({
            index,
            name: typeof raw?.name === 'string' ? raw.name : '',
            single: typeof raw?.single === 'string' ? raw.single : '',
            sel: raw?.sel === true,
        })
    }
    return out
}

function safeGetResidsJSON(chain: MolChain): string | null {
    try {
        return chain.getResidsJSON()
    } catch {
        return null
    }
}

function getSeqPanelData(
    ctx: WorkerContext,
    args: GetSeqPanelDataArgs,
): GetSeqPanelDataResult {
    const scene = getSceneOrNull(ctx, args.sceneId)
    if (!scene) return { rows: [] }

    const filter = args.molIds
        ? new Set(args.molIds.filter((n) => typeof n === 'number'))
        : null

    const rows: SeqPanelRow[] = []
    for (const node of collectObjectNodes(scene)) {
        if (filter && !filter.has(node.id)) continue

        const mol = scene.getObject(node.id) as CueMolObject | null
        if (!isMolCoordLike(mol)) continue

        let chainsJson: string
        try {
            chainsJson = mol.getChainsJSON()
        } catch {
            continue
        }
        const chainNames = parseChainNames(chainsJson)
        for (const chainName of chainNames) {
            let chain: MolChain | null
            try {
                chain = mol.getChain(chainName) as MolChain | null
            } catch {
                continue
            }
            if (!chain) continue
            const residsJson = safeGetResidsJSON(chain)
            if (!residsJson) continue
            const residues = parseResidues(residsJson)
            if (residues.length === 0) continue
            rows.push({
                molUid: node.id,
                molName: node.name,
                chainName,
                residues,
            })
        }
    }
    return { rows }
}

export const services = {
    getSeqPanelData,
}
