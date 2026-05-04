import type { LogEntry } from "../types";
import type { SceneNode, MolNode, MolOption } from "../components/panels/SidePanel";

export const SCENE_DATA: SceneNode = {
  id: "scene1",
  label: "Scene1",
  icon: "film",
  objects: [
    {
      id: "mol1",
      label: "1CRN (Crambin)",
      icon: "symbol-circle",
      visible: true,
      children: [
        { id: "r1", label: "simple", icon: "style", visible: true },
        { id: "r2", label: "cartoon", icon: "style", visible: true },
        { id: "r3", label: "cpk", icon: "style", visible: false },
      ],
    },
    {
      id: "mol2",
      label: "3J3Q (Ribosome)",
      icon: "symbol-circle",
      visible: true,
      children: [
        { id: "r4", label: "ribbon", icon: "style", visible: true },
        { id: "r5", label: "ball+stick", icon: "style", visible: false },
      ],
    },
    {
      id: "mol3",
      label: "6LU7 (SARS-CoV-2)",
      icon: "symbol-circle",
      visible: true,
      children: [
        { id: "r6", label: "surface", icon: "style", visible: true },
      ],
    },
  ],
};

export const MOL_TREE: MolNode[] = [
  {
    id: "chainA",
    label: "Chain A",
    icon: "link",
    children: [
      {
        id: "res1",
        label: "THR 1",
        icon: "cube",
        children: [
          { id: "a1", label: "N", icon: "dot", children: [] },
          { id: "a2", label: "CA", icon: "dot", children: [] },
          { id: "a3", label: "C", icon: "dot", children: [] },
          { id: "a4", label: "O", icon: "dot", children: [] },
          { id: "a5", label: "CB", icon: "dot", children: [] },
        ],
      },
      {
        id: "res2",
        label: "THR 2",
        icon: "cube",
        children: [
          { id: "a6", label: "N", icon: "dot", children: [] },
          { id: "a7", label: "CA", icon: "dot", children: [] },
          { id: "a8", label: "C", icon: "dot", children: [] },
          { id: "a9", label: "O", icon: "dot", children: [] },
        ],
      },
      {
        id: "res3",
        label: "CYS 3",
        icon: "cube",
        children: [
          { id: "a10", label: "N", icon: "dot", children: [] },
          { id: "a11", label: "CA", icon: "dot", children: [] },
          { id: "a12", label: "SG", icon: "dot", children: [] },
        ],
      },
      { id: "res4", label: "CYS 4", icon: "cube", children: [] },
      { id: "res5", label: "PRO 5", icon: "cube", children: [] },
      { id: "res6", label: "SER 6", icon: "cube", children: [] },
      { id: "res7", label: "ILE 7", icon: "cube", children: [] },
      { id: "res8", label: "VAL 8", icon: "cube", children: [] },
    ],
  },
  {
    id: "chainB",
    label: "Chain B",
    icon: "link",
    children: [
      { id: "res20", label: "ALA 1", icon: "cube", children: [] },
      { id: "res21", label: "GLY 2", icon: "cube", children: [] },
      { id: "res22", label: "LEU 3", icon: "cube", children: [] },
    ],
  },
];

export const MOLECULE_OPTIONS: MolOption[] = [
  { id: "mol1", label: "1CRN (Crambin)" },
  { id: "mol2", label: "3J3Q (Ribosome)" },
  { id: "mol3", label: "6LU7 (SARS-CoV-2)" },
];

export const INITIAL_LOGS: LogEntry[] = [
  { time: "09:00:01", level: "INFO", msg: "CueMol2 v4.2.0 initialized" },
  { time: "09:00:01", level: "INFO", msg: "OpenGL Core Profile 4.6 detected" },
  { time: "09:00:02", level: "INFO", msg: "Python 3.11.8 embedded interpreter ready" },
  { time: "09:00:02", level: "INFO", msg: "Scene1 created" },
  { time: "09:00:03", level: "INFO", msg: "Loading 1CRN.pdb ..." },
  { time: "09:00:03", level: "INFO", msg: "1CRN.pdb loaded: 327 atoms, 46 residues" },
  { time: "09:00:03", level: "INFO", msg: 'Renderer "cartoon" created for 1CRN' },
  {
    time: "09:00:04",
    level: "WARN",
    msg: "Deprecated glLineWidth >1.0 detected, using geometry shader fallback",
  },
  { time: "09:00:04", level: "INFO", msg: 'Renderer "cpk" created for 1CRN' },
  { time: "09:00:05", level: "INFO", msg: "Loading 3J3Q.pdb ..." },
  { time: "09:00:06", level: "INFO", msg: "3J3Q.pdb loaded: 12840 atoms, 1680 residues" },
  { time: "09:00:06", level: "INFO", msg: 'Renderer "ribbon" created for 3J3Q' },
];

export const SAMPLE_FILES: Record<string, string> = {
  "1CRN.pdb": `HEADER    PLANT PROTEIN                          30-APR-81   1CRN
TITLE     WATER STRUCTURE OF A HYDROPHOBIC PROTEIN AT ATOMIC
TITLE    2 RESOLUTION. PENTAGON RINGS OF WATER MOLECULES IN CRYSTALS
TITLE    3 OF CRAMBIN
COMPND    MOL_ID: 1;
COMPND   2 MOLECULE: CRAMBIN;
COMPND   3 CHAIN: A;
SOURCE    MOL_ID: 1;
SOURCE   2 ORGANISM_SCIENTIFIC: CRAMBE HISPANICA SUBSP. ABYSSINICA;
ATOM      1  N   THR A   1      17.047  14.099   3.625  1.00 13.79
ATOM      2  CA  THR A   1      16.967  12.784   4.338  1.00 10.80
ATOM      3  C   THR A   1      15.685  12.755   5.133  1.00  9.19
ATOM      4  O   THR A   1      15.268  13.825   5.594  1.00  9.85
ATOM      5  CB  THR A   1      18.170  12.703   5.337  1.00 13.02
ATOM      6  OG1 THR A   1      19.334  12.829   4.463  1.00 15.06
ATOM      7  CG2 THR A   1      18.150  11.546   6.304  1.00 14.23`,
  "config.json": `{
  "scene": {
    "name": "Scene1",
    "background": "#1a1a2e",
    "ambient_light": 0.3,
    "fog_enabled": true,
    "fog_start": 50.0,
    "fog_end": 100.0
  },
  "camera": {
    "type": "perspective",
    "fov": 45,
    "near": 0.1,
    "far": 1000.0,
    "position": [0, 0, 50]
  },
  "renderers": [
    { "name": "cartoon", "type": "cartoon", "smooth": 4 },
    { "name": "cpk", "type": "cpk", "radius": 0.3 }
  ]
}`,
  "script.py": `#!/usr/bin/env python3
"""CueMol automation script"""

import cuemol

scene = cuemol.scene("Scene1")
mol = scene.load("1CRN.pdb", "pdb")

# Create renderers
rend1 = mol.create_renderer("cartoon")
rend1.colorscheme = "chain"
rend1.smooth = 4

rend2 = mol.create_renderer("cpk")
rend2.selection = "resn.CYS"
rend2.radius = 0.3

# Apply selection
sel = cuemol.sel("chain.A AND resid.1:10")
mol.select(sel)

print(f"Loaded: {mol.name}, atoms={mol.natoms}")
scene.update()`,
};
