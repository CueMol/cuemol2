/**
 * @file worker/server/services/renderBackends/PovrayBackend.ts
 * @description POV-Ray rendering backend (ports `uxp_gui` povrender.js).
 *
 * The scene is exported to one `.pov`/`.inc` pair. When the exporter
 * reports a post-blend table (semi-transparent objects), the scene is
 * rendered as several layers and `blendpng` composites them; otherwise a
 * single layer is rendered. `blendpng` always runs as the finalize step
 * (it also stamps the output DPI), matching povrender.js.
 */

import * as os from "os";
import * as path from "path";

import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { PovSceneExporter } from "@cuemol/core/src/wrappers/PovSceneExporter";
import type { WorkerContext } from "../../types/WorkerContext";
import type { RenderSettingsSnapshot } from "../../../../data/renderResult";
import type { RenderBinaries } from "../../../shared/renderTypes";
import {
  type RenderBackend,
  type ExportedScene,
  type RenderTaskSpec,
  numVal,
  strVal,
  boolVal,
} from "./RenderBackend";

/** Expand a leading `~` to the user's home directory. */
function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/** Map a radiosity preset label to POV-Ray's `_radiosity` code (-1 = off). */
const RADIOSITY_LABELS = [
  "Disable", "Default", "Debug", "Fast", "Normal", "2-Bounce", "Final",
  "Outdoor LQ", "Outdoor HQ", "Outdoor Light", "Indoor LQ", "Indoor HQ",
];
function radiosityCode(label: string): number {
  const idx = RADIOSITY_LABELS.indexOf(label);
  return idx <= 0 ? -1 : idx - 1;
}

/** Map a stereo-mode label to POV-Ray's `_stereo` code. */
function stereoCode(mode: string): number {
  if (mode === "left") return -1;
  if (mode === "right") return 1;
  return 0;
}

const RENDERED_RE = /Rendered \d+ of \d+ pixels \((\d+)%\)/;

/** One render layer: extra POV-Ray declares plus the layer's alpha. */
interface RenderLayer {
  optArgs: string[];
  alpha: number;
}

/**
 * Derive render layers from the exporter's blend table. An empty table
 * yields a single layer; otherwise layer 0 hides every overlay object and
 * each subsequent layer shows only its own objects (mirrors povrender.js).
 */
function computeLayers(blendTable: Record<string, string>): RenderLayer[] {
  const keys = Object.keys(blendTable);
  if (keys.length === 0) return [{ optArgs: [], alpha: 1.0 }];

  const allNames = new Set<string>();
  for (const k of keys) {
    for (const n of blendTable[k].split(",")) if (n) allNames.add(n);
  }
  const layers: RenderLayer[] = [
    // Layer 0 (background): hide every overlay object.
    { optArgs: [...allNames].map((n) => `Declare=_show${n}=0`), alpha: 1.0 },
  ];
  for (const k of keys) {
    const shown = new Set(blendTable[k].split(",").filter(Boolean));
    layers.push({
      optArgs: [...allNames]
        .filter((n) => !shown.has(n))
        .map((n) => `Declare=_show${n}=0`),
      alpha: parseFloat(`0.${k}`),
    });
  }
  return layers;
}

/** Build the POV-Ray argument string for one layer. */
function buildPovArgs(
  exported: ExportedScene,
  snapshot: RenderSettingsSnapshot,
  outPng: string,
  optArgs: string[],
  povInc: string,
): string {
  const common = snapshot.commonProps;
  const pov = snapshot.backendProps;
  const perspective = strVal(common, "projection", "perspective") === "perspective";

  const args: string[] = [
    `"Input_File_Name='${exported.inputPath}'"`,
    `"Output_File_Name='${outPng}'"`,
    `"Library_Path='${povInc}'"`,
    `"Library_Path='${exported.workDir}'"`,
    `Declare=_stereo=${stereoCode(strVal(common, "stereoMode", "none"))}`,
    `Declare=_iod=${numVal(common, "stereoDepth", 0.03)}`,
    `Declare=_perspective=${perspective ? 1 : 0}`,
    `Declare=_shadow=${boolVal(pov, "shadow", false) ? 1 : 0}`,
    `Declare=_light_inten=${numVal(pov, "lightIntensity", 1.3)}`,
    `Declare=_flash_frac=${numVal(pov, "flashFraction", 0.6)}`,
    `Declare=_amb_frac=${numVal(pov, "ambientFraction", 0)}`,
    "File_Gamma=1",
    "-D",
    `+WT${numVal(common, "numThreads", 2)}`,
    `+W${numVal(common, "width", 640)}`,
    `+H${numVal(common, "height", 480)}`,
    "+FN8",
    "Quality=11",
    "Antialias=On",
    "Antialias_Depth=3",
    "Antialias_Threshold=0.1",
    "Jitter=Off",
    "+V",
  ];

  const spread = numVal(pov, "lightSpread", 1);
  if (spread > 1) args.push(`Declare=_light_spread=${spread}`);
  if (boolVal(common, "transparentBg", false)) {
    args.push("+UA");
    args.push("Declare=_transpbg=1");
  }
  const radio = radiosityCode(strVal(pov, "radiosityMode", "Disable"));
  if (radio >= 0) args.push(`Declare=_radiosity=${radio}`);

  return [...args, ...optArgs].join(" ");
}

export const povrayBackend: RenderBackend = {
  id: "povray",

  exportScene(
    ctx: WorkerContext,
    scene: Scene,
    snapshot: RenderSettingsSnapshot,
    workDir: string,
  ): ExportedScene {
    const exporter = ctx.strMgr.createHandler("pov", 2) as PovSceneExporter;
    if (!exporter) throw new Error("cannot create POV-Ray exporter");

    // Mirror uxp_gui povrender.js exactly: set only these properties and
    // leave creaseLimit / edgeRise at their C++ defaults.
    const common = snapshot.commonProps;
    exporter.perspective = strVal(common, "projection", "perspective") === "perspective";
    exporter.useClipZ = boolVal(common, "clipPlane", true);
    exporter.usePostBlend = boolVal(common, "postBlend", true);
    exporter.showEdgeLines = boolVal(common, "edgeLines", true);
    exporter.usePixImgs = false;
    exporter.makeRelIncPath = false;
    exporter.camera = "__current";
    exporter.width = numVal(common, "width", 640);
    exporter.height = numVal(common, "height", 480);

    const povPath = path.join(workDir, "render.pov");
    const incPath = path.join(workDir, "render.inc");
    exporter.attach(scene);
    exporter.setPath(povPath);
    exporter.setSubPath("inc", incPath);
    exporter.write();
    const blendTableJson = exporter.blendTable;
    exporter.detach();

    let blendTable: Record<string, string> = {};
    if (blendTableJson) {
      try {
        blendTable = JSON.parse(blendTableJson) as Record<string, string>;
      } catch {
        blendTable = {};
      }
    }
    return { inputPath: povPath, workDir, blendTable };
  },

  buildTasks(
    exported: ExportedScene,
    snapshot: RenderSettingsSnapshot,
    binaries: RenderBinaries,
  ): RenderTaskSpec[] {
    const povExe = expandHome(binaries.povrayExe);
    const povInc = expandHome(binaries.povrayInc);
    const blendpngExe = expandHome(binaries.blendpng);

    const layers = computeLayers(exported.blendTable);
    const layerPaths = layers.map((_, i) =>
      path.join(exported.workDir, `render-layer${i}.png`),
    );

    // One POV-Ray task per layer (run in parallel).
    const tasks: RenderTaskSpec[] = layers.map((layer, i) => ({
      exe: povExe,
      args: buildPovArgs(exported, snapshot, layerPaths[i], layer.optArgs, povInc),
      kind: "render",
    }));

    // blendpng finalize task: composite layers, stamp DPI.
    const blendArgs: string[] = [layerPaths[0]];
    for (let i = 1; i < layers.length; i++) {
      blendArgs.push(layerPaths[i]);
      blendArgs.push(String(layers[i].alpha));
    }
    blendArgs.push(this.outputImagePath(exported));
    blendArgs.push(String(numVal(snapshot.commonProps, "dpi", 600)));
    tasks.push({
      exe: blendpngExe,
      args: blendArgs.join(" "),
      kind: "finalize",
    });
    return tasks;
  },

  parseProgress(stdout: string): number | null {
    const m = RENDERED_RE.exec(stdout);
    return m ? parseInt(m[1], 10) : null;
  },

  outputImagePath(exported: ExportedScene): string {
    return path.join(exported.workDir, "render.png");
  },
};
