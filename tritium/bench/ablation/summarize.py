#!/usr/bin/env python3
"""
Summarize an ablation run and check its acceptance criteria
(docs/plans/ablation-bench-instructions.md, sections 5 and 6).

Reads every raw/bench-*.json under the results directory, groups cells by
condition x structure x scenario, and writes:

  summary.csv   mean and standard deviation per group, for the section 6 metrics
  checks.json   the six section 5 criteria, each with its values and pass/fail
  effects.csv   main effects and interaction for 3J3Q and 4V6X (fps, crdSend)

Nothing is dropped: a failed cell stays in the counts as missing.

Usage: summarize.py <results dir>
"""

import collections
import csv
import glob
import json
import math
import os
import statistics as st
import sys

CONDS = ['A', 'B', 'C', 'D']
RING = {'A': 0, 'B': 1, 'C': 0, 'D': 1}
STAGING = {'A': 0, 'B': 0, 'C': 1, 'D': 1}
STRUCTS = ['1crn', '4hhb', '1aon', '4v6x', '3j3q']


def split_stem(stem):
    """'3j3q-cpk-coord-morph' -> ('3j3q', 'coord-morph')."""
    s, _, scen = stem.partition('-cpk-')
    return s, scen


def metrics(r):
    t = r.get('transfer') or {}
    crd = (t.get('crdSendMs') or {}).get('mean')
    tex = (t.get('texUploadMs') or {}).get('mean')
    gl = r.get('glPerFrame') or {}
    return {
        'update_fps': r['updateFps'],
        'render_fps': r['renderFps'],
        'frame_ms_mean': r['frameMs']['mean'],
        'frame_ms_p95': r['frameMs']['p95'],
        'cpu_ms': r['cpuMs']['mean'],
        'gpu_ms': (r.get('gpuMs') or {}).get('mean'),
        'crd_send_ms': crd,
        'crd_send_p95_ms': (t.get('crdSendMs') or {}).get('p95'),
        'tex_upload_ms': tex,
        'tex_upload_p95_ms': (t.get('texUploadMs') or {}).get('p95'),
        'crd_minus_tex_ms': (crd - tex) if crd is not None and tex is not None else None,
        'alloc_mb_per_frame': t.get('allocMBPerFrame'),
        'tex_bytes_per_frame': gl.get('texSubImageBytes'),
        'rss_mb': (r.get('memory') or {}).get('rssMB'),
    }


def mean_sd(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if not xs:
        return None, None
    return st.mean(xs), (st.stdev(xs) if len(xs) > 1 else 0.0)


def main(outdir):
    cells = collections.defaultdict(list)     # (cond, struct, scen) -> [result]
    failed = collections.defaultdict(list)
    for f in sorted(glob.glob(os.path.join(outdir, 'raw', 'bench-*.json'))):
        d = json.load(open(f))
        cond = (d.get('label') or '?')[0]
        for c in d.get('cells', []):
            s, scen = split_stem(c['cell']['stem'])
            cells[(cond, s, scen)].append(c['result'])
        for c in d.get('failed', []):
            s, scen = split_stem(c['cell']['stem'])
            failed[(cond, s, scen)].append(c.get('error'))

    keys = sorted(set(cells) | set(failed),
                  key=lambda k: (k[2], STRUCTS.index(k[1]) if k[1] in STRUCTS else 9, k[0]))
    names = list(metrics(next(iter(cells.values()))[0]).keys()) if cells else []

    summary = {}
    with open(os.path.join(outdir, 'summary.csv'), 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['condition', 'ring', 'staging', 'structure', 'scenario', 'atoms', 'n', 'failed']
                   + [f'{m}_{x}' for m in names for x in ('mean', 'sd')])
        for k in keys:
            rs = cells.get(k, [])
            ms = [metrics(r) for r in rs]
            row = {m: mean_sd([x[m] for x in ms]) for m in names}
            summary[k] = row
            atoms = rs[0].get('atomCount') if rs else ''
            w.writerow([k[0], RING.get(k[0], ''), STAGING.get(k[0], ''), k[1], k[2], atoms,
                        len(rs), len(failed.get(k, []))]
                       + [('' if v is None else round(v, 6)) for m in names for v in row[m]])

    checks = []

    def check(name, ok, detail):
        checks.append({'criterion': name, 'pass': bool(ok), 'detail': detail})

    def val(cond, s, scen, m):
        v = summary.get((cond, s, scen), {}).get(m)
        return v[0] if v else None

    def within(v, ref, tol):
        return v is not None and abs(v - ref) <= tol * abs(ref)

    # 1. A reproduces the documented values (+-5%).
    a = {
        '4v6x coord-morph fps': (val('A', '4v6x', 'coord-morph', 'update_fps'), 60.0),
        '4v6x coord-morph cpu ms': (val('A', '4v6x', 'coord-morph', 'cpu_ms'), 1.58),
        '4v6x static-orbit cpu ms': (val('A', '4v6x', 'static-orbit', 'cpu_ms'), 0.30),
        '3j3q coord-morph fps': (val('A', '3j3q', 'coord-morph', 'update_fps'), 36.4),
        '3j3q coord-morph texUpload ms': (val('A', '3j3q', 'coord-morph', 'tex_upload_ms'), 22.0),
    }
    check('1. A reproduces documented values (+-5%)',
          all(within(v, ref, 0.05) for v, ref in a.values()),
          {k: {'measured': v, 'reference': ref, 'within_5pct': within(v, ref, 0.05)}
           for k, (v, ref) in a.items()})

    # 2. B 3J3Q coord-morph around 52-54 fps.
    b = val('B', '3j3q', 'coord-morph', 'update_fps')
    check('2. B 3J3Q coord-morph 52-54 fps', b is not None and 52.0 <= b <= 54.0,
          {'measured': b, 'nearer': (None if b is None else ('52.4 (commit)' if abs(b - 52.4) < abs(b - 53.9) else '53.9 (docs)'))})

    # 3. idle draws nothing and makes no GL calls, under every condition.
    idle = {}
    for c in CONDS:
        rs = cells.get((c, '4v6x', 'idle'), [])
        idle[c] = [{'drawnFrames': r['drawnFrames'], 'glTotal': (r.get('glPerFrame') or {}).get('total', 0)} for r in rs]
    check('3. idle: zero drawn frames and zero GL calls',
          all(rs and all(x['drawnFrames'] == 0 and x['glTotal'] == 0 for x in rs) for rs in idle.values()),
          idle)

    # 4. static-orbit CPU and GPU within +-3% across conditions.
    so = {}
    ok4 = True
    for s in STRUCTS:
        for m in ('cpu_ms', 'gpu_ms'):
            vs = {c: val(c, s, 'static-orbit', m) for c in CONDS}
            got = [v for v in vs.values() if v is not None]
            if len(got) < 4:
                ok4 = False
                so[f'{s} {m}'] = {'values': vs, 'pass': False, 'note': 'missing'}
                continue
            mid = st.mean(got)
            spread = max(abs(v - mid) / mid for v in got) if mid else 0.0
            passed = spread <= 0.03
            ok4 = ok4 and passed
            so[f'{s} {m}'] = {'values': vs, 'max_dev_from_mean': spread, 'pass': passed}
    check('4. static-orbit CPU and GPU within +-3% across conditions', ok4, so)

    # 5. fitted, pins, input isolation; renderer settings equal across conditions.
    bad = []
    props = collections.defaultdict(set)
    for (c, s, scen), rs in cells.items():
        for r in rs:
            if not r['view']['fitted']:
                bad.append((c, s, scen, 'not fitted'))
            if r['unpinned']:
                bad.append((c, s, scen, f"unpinned {r['unpinned']}"))
            inp = r['input']
            if not (inp['gpuPickOff'] and not inp['hoverMounted'] and not inp['canvasMouseBound']):
                bad.append((c, s, scen, f'input {inp}'))
            props[(s, scen)].add(json.dumps(r['rendererProps'], sort_keys=True))
    mismatched = {f'{s} {scen}': sorted(v) for (s, scen), v in props.items() if len(v) > 1}
    check('5. fitted, pinned, input isolated; rendererProps equal', not bad and not mismatched,
          {'violations': bad, 'rendererProps_mismatch': mismatched})

    # 6. Coefficient of variation under 3% over the repetitions (listed, not removed).
    cv_bad = []
    for k, row in summary.items():
        for m in ('update_fps', 'render_fps', 'frame_ms_mean', 'cpu_ms', 'gpu_ms', 'crd_send_ms', 'tex_upload_ms'):
            mu, sd = row.get(m, (None, None))
            if mu and sd is not None and mu != 0 and sd / abs(mu) >= 0.03:
                cv_bad.append({'cell': '/'.join(k), 'metric': m, 'cv': sd / abs(mu), 'mean': mu})
    check('6. repetition CV under 3%', not cv_bad, {'over_3pct': cv_bad})

    missing = {'/'.join(k): v for k, v in failed.items()}
    with open(os.path.join(outdir, 'checks.json'), 'w') as fh:
        json.dump({'checks': checks, 'failed_cells': missing}, fh, indent=2)

    # Main effects and interaction (2x2), per structure and metric.
    with open(os.path.join(outdir, 'effects.csv'), 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['structure', 'metric', 'A', 'B', 'C', 'D',
                    'ring_main', 'staging_main', 'interaction'])
        for s in ('3j3q', '4v6x'):
            for m in ('update_fps', 'crd_send_ms', 'tex_upload_ms', 'crd_minus_tex_ms'):
                v = {c: val(c, s, 'coord-morph', m) for c in CONDS}
                if any(x is None for x in v.values()):
                    w.writerow([s, m] + [v[c] for c in CONDS] + ['', '', ''])
                    continue
                ring = (v['B'] + v['D']) / 2 - (v['A'] + v['C']) / 2
                stg = (v['C'] + v['D']) / 2 - (v['A'] + v['B']) / 2
                inter = (v['D'] - v['C']) - (v['B'] - v['A'])
                w.writerow([s, m] + [round(v[c], 4) for c in CONDS]
                           + [round(ring, 4), round(stg, 4), round(inter, 4)])

    for c in checks:
        print(f"{'PASS' if c['pass'] else 'FAIL'}  {c['criterion']}")
    if missing:
        print(f'missing cells: {missing}')


if __name__ == '__main__':
    main(sys.argv[1])
