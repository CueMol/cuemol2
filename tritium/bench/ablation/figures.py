#!/usr/bin/env python3
"""
Figures for the ring x staging ablation (docs/plans/ablation-bench-instructions.md, section 6).

Reads summary.csv from the results directory (summarize.py) and writes
fig_a..fig_d as PDF and PNG next to it.

  Fig A  coord-morph update fps against atom count, one line per condition
  Fig B  per-frame send time against bytes sent per frame (log-log), two
         panels: texUpload, and crdSend - texUpload
  Fig C  3J3Q: update fps and crdSend for the four conditions
  Fig D  static-orbit worker CPU ms and GPU ms for the four conditions

Usage: .venv/bin/python figures.py <results dir>
"""

import csv
import os
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

CONDS = ['A', 'B', 'C', 'D']
LABELS = {
    'A': 'A: neither',
    'B': 'B: ring',
    'C': 'C: staging',
    'D': 'D: ring + staging',
}
STYLE = {
    'A': dict(color='#7f7f7f', marker='o', linestyle='-'),
    'B': dict(color='#1f77b4', marker='s', linestyle='-'),
    'C': dict(color='#ff7f0e', marker='^', linestyle='-'),
    'D': dict(color='#2ca02c', marker='D', linestyle='-'),
}
STRUCTS = ['1crn', '4hhb', '1aon', '4v6x', '3j3q']

plt.rcParams.update({
    'font.family': 'sans-serif',
    'font.size': 8.5,
    'axes.titlesize': 9,
    'axes.labelsize': 8.5,
    'legend.fontsize': 7.5,
    'xtick.labelsize': 8,
    'ytick.labelsize': 8,
    'figure.facecolor': 'white',
    'axes.facecolor': 'white',
    'savefig.facecolor': 'white',
    'axes.spines.top': False,
    'axes.spines.right': False,
})


def load(outdir):
    rows = {}
    with open(os.path.join(outdir, 'summary.csv')) as fh:
        for r in csv.DictReader(fh):
            rows[(r['condition'], r['structure'], r['scenario'])] = r
    return rows


def num(r, key):
    try:
        v = r.get(key, '')
        return float(v) if v != '' else None
    except (TypeError, ValueError):
        return None


def save(fig, outdir, name):
    for ext in ('pdf', 'png'):
        fig.savefig(os.path.join(outdir, f'{name}.{ext}'), dpi=300, bbox_inches='tight')
    plt.close(fig)


def series(rows, cond, scen, key, xkey='atoms'):
    xs, ys, es = [], [], []
    for s in STRUCTS:
        r = rows.get((cond, s, scen))
        if not r:
            continue
        x, y = num(r, xkey), num(r, f'{key}_mean')
        if x is None or y is None:
            continue
        xs.append(x)
        ys.append(y)
        es.append(num(r, f'{key}_sd') or 0.0)
    return xs, ys, es


def fig_a(rows, outdir):
    fig, ax = plt.subplots(figsize=(3.4, 2.5))
    for c in CONDS:
        xs, ys, es = series(rows, c, 'coord-morph', 'update_fps')
        ax.errorbar(xs, ys, yerr=es, label=LABELS[c], markersize=3.5, linewidth=1.1,
                    capsize=2, **STYLE[c])
    ax.axhline(60, color='black', linewidth=0.7, linestyle=':')
    ax.text(ax.get_xlim()[0] if ax.get_xlim()[0] > 0 else 300, 61, '60 fps', fontsize=7, va='bottom')
    ax.set_xscale('log')
    ax.set_xlabel('atoms')
    ax.set_ylabel('update fps (coord-morph)')
    ax.set_ylim(bottom=0)
    ax.legend(frameon=False, loc='lower left')
    save(fig, outdir, 'fig_a_fps_vs_atoms')


def fig_b(rows, outdir):
    fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.6), sharex=True)
    panels = [('tex_upload_ms', 'texUpload (texSubImage2D) ms'),
              ('crd_minus_tex_ms', 'crdSend - texUpload ms\n(gather, allocation, copy, N-API)')]
    for ax, (key, title) in zip(axes, panels):
        for c in CONDS:
            xs, ys, _ = series(rows, c, 'coord-morph', key, xkey='tex_bytes_per_frame_mean')
            pts = [(x, y) for x, y in zip(xs, ys) if x and y and x > 0 and y > 0]
            if pts:
                ax.plot([p[0] for p in pts], [p[1] for p in pts], label=LABELS[c],
                        markersize=3.5, linewidth=1.1, **STYLE[c])
        ax.set_xscale('log')
        ax.set_yscale('log')
        ax.set_xlabel('bytes uploaded per frame')
        ax.set_title(title)
    axes[0].set_ylabel('ms per frame')
    axes[0].legend(frameon=False, loc='upper left')
    save(fig, outdir, 'fig_b_send_time_vs_bytes')


def fig_c(rows, outdir):
    fig, axes = plt.subplots(1, 2, figsize=(5.2, 2.3))
    for ax, (key, ylabel) in zip(axes, [('update_fps', 'update fps'), ('crd_send_ms', 'crdSend ms')]):
        vals, errs = [], []
        for c in CONDS:
            r = rows.get((c, '3j3q', 'coord-morph'), {})
            vals.append(num(r, f'{key}_mean') or 0.0)
            errs.append(num(r, f'{key}_sd') or 0.0)
        ax.bar(range(4), vals, yerr=errs, capsize=2,
               color=[STYLE[c]['color'] for c in CONDS], width=0.65)
        ax.set_xticks(range(4))
        ax.set_xticklabels(['A\nneither', 'B\nring', 'C\nstaging', 'D\nboth'])
        ax.set_ylabel(ylabel)
        if key == 'update_fps':
            ax.axhline(60, color='black', linewidth=0.7, linestyle=':')
    fig.suptitle('3J3Q (2,440,800 atoms), coord-morph', fontsize=9)
    save(fig, outdir, 'fig_c_3j3q_2x2')


def fig_d(rows, outdir):
    fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.4))
    width = 0.2
    for ax, (key, ylabel) in zip(axes, [('cpu_ms', 'worker CPU ms'), ('gpu_ms', 'GPU ms')]):
        for i, c in enumerate(CONDS):
            vals, errs = [], []
            for s in STRUCTS:
                r = rows.get((c, s, 'static-orbit'), {})
                vals.append(num(r, f'{key}_mean') or 0.0)
                errs.append(num(r, f'{key}_sd') or 0.0)
            ax.bar([j + (i - 1.5) * width for j in range(len(STRUCTS))], vals, width=width,
                   yerr=errs, capsize=1.5, color=STYLE[c]['color'], label=LABELS[c])
        ax.set_xticks(range(len(STRUCTS)))
        ax.set_xticklabels([s.upper() for s in STRUCTS])
        ax.set_ylabel(ylabel)
    axes[0].legend(frameon=False, loc='upper left')
    fig.suptitle('static-orbit (no coordinates sent): the four conditions should agree', fontsize=9)
    save(fig, outdir, 'fig_d_static_orbit_control')


def main(outdir):
    rows = load(outdir)
    fig_a(rows, outdir)
    fig_b(rows, outdir)
    fig_c(rows, outdir)
    fig_d(rows, outdir)
    print(f'figures written to {outdir}')


if __name__ == '__main__':
    main(sys.argv[1])
