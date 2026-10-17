#!/usr/bin/env python3
"""
Check that a trajectory written by fetch-md.py's `xtc-drop-resname` holds the
same frames as its source, less the dropped residue.

`xtc-drop-resname` re-encodes the XTC with MDAnalysis, so its bytes, and so
its SHA-256, can change with the MDAnalysis build even when the frames do
not. When a derived file does not match the hash pinned in md-corpus.json,
this tells a different encoding apart from different data: it reads the
source with its topology, selects every atom but the residue, and compares
that selection with the derived file frame by frame. Positions and time must
be equal. The box may differ by one float32 step (about 3e-5 A at 360 A):
MDAnalysis converts it from nm to A on reading and back on writing, and that
round trip can move the last bit. Larger box differences fail. The step
number in each frame header is reported but not compared, since MDAnalysis
may write the frame index there.

Needs MDAnalysis, for example:
  uv run --no-project --python 3.12 --with MDAnalysis==2.7.0 \\
    python check-drop-resname.py data/md/a4tail/em.gro data/md/a4tail/prod-100f.xtc \\
    data/md/a4tail/em-nosol.gro data/md/a4tail/prod-100f-nosol.xtc

Exits 0 when every frame matches, 1 otherwise.
"""

import argparse
import sys

import numpy as np
import MDAnalysis as mda


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('src_top', help='topology of the source (e.g. em.gro)')
    ap.add_argument('src_xtc', help='source trajectory (e.g. prod-100f.xtc)')
    ap.add_argument('out_top', help='derived topology (e.g. em-nosol.gro)')
    ap.add_argument('out_xtc', help='derived trajectory (e.g. prod-100f-nosol.xtc)')
    ap.add_argument('--resname', default='SOL', help='the residue name that was dropped')
    args = ap.parse_args()

    src = mda.Universe(args.src_top, args.src_xtc)
    kept = src.select_atoms(f'not resname {args.resname}')
    out = mda.Universe(args.out_top, args.out_xtc)

    print(f'atoms: source {src.atoms.n_atoms}, kept {kept.n_atoms}, derived {out.atoms.n_atoms}')
    print(f'frames: source {len(src.trajectory)}, derived {len(out.trajectory)}')
    ok = kept.n_atoms == out.atoms.n_atoms and len(src.trajectory) == len(out.trajectory)
    if not ok:
        print('MISMATCH: atom or frame count')
        return 1

    pos_frames = time_frames = step_frames = 0
    box_ulp_frames = box_bad_frames = 0
    max_diff = 0.0
    max_box_diff = 0.0
    for ts_src, ts_out in zip(src.trajectory, out.trajectory):
        d = float(np.abs(kept.positions - out.atoms.positions).max())
        if d != 0.0:
            pos_frames += 1
            max_diff = max(max_diff, d)
        if ts_src.time != ts_out.time:
            time_frames += 1
        a = ts_src.dimensions.astype(np.float32)
        b = ts_out.dimensions.astype(np.float32)
        if not np.array_equal(a, b):
            max_box_diff = max(max_box_diff, float(np.abs(a.astype(np.float64) - b).max()))
            # One float32 step at the larger of the two values.
            if np.all(np.abs(a - b) <= np.spacing(np.maximum(np.abs(a), np.abs(b)))):
                box_ulp_frames += 1
            else:
                box_bad_frames += 1
        if ts_src.data.get('step') != ts_out.data.get('step'):
            step_frames += 1

    print(f'frames whose positions differ: {pos_frames} (max |diff| {max_diff} A)')
    print(f'frames whose time differs: {time_frames}')
    print(f'frames whose box differs by one float32 step: {box_ulp_frames} '
          f'(max |diff| {max_box_diff:.3g} A), by more: {box_bad_frames}')
    print(f'frames whose header step differs: {step_frames} (not compared)')
    ok = pos_frames == 0 and time_frames == 0 and box_bad_frames == 0
    print('OK: same frames' if ok else 'MISMATCH: frames differ')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
