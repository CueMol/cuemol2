import type { LogEntry } from "../types";
import type { MolOption } from "../components/panels/SidePanel";

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

