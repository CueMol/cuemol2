/**
 * @file __test__/hatchSpec.test.ts
 * @description Pins the umbreon hatch spec text <-> typed record contract:
 * key typing and defaults, boolean spellings, unknown keys surviving a round
 * trip, float-noise-free output, kind-filtered layer keys, and the identity
 * the dirty check relies on (formatting is a pure function of the values).
 */

import { describe, it, expect } from 'vitest';
import {
    parseHatchSpec,
    formatHatchSpec,
    formatHatchLayersSpec,
    newHatchLayer,
    cloneHatchSpec,
    isSameHatchSpec,
    layerFieldEnabled,
    toneFieldEnabled,
    inkFieldEnabled,
    DEFAULT_HATCH_TONE,
    DEFAULT_HATCH_INK,
} from '../data/hatchSpec';

const RICHARDSON =
    'layer: kind=line,angle=55,spacing=0.5,subdiv=2,width=0.45,tonehi=0.92,tonelo=0.55,fade=0,opacity=1,inkscale=1,soft=0.55,seed=0,jitter=0.22,wobble=1.2,wobwave=60,wjitter=0.45,slen=50,sgap=5,taper=0.35,anglejitter=5,lenjitter=0.5,tooth=0.15,toothscale=3\n' +
    'layer: kind=dot,angle=45,spacing=5,subdiv=0,dotscale=1,tonehi=1,tonelo=1,fade=32,opacity=1,inkscale=1,soft=0.5,seed=0,jitter=0,shape=2,aspect=1,dotangle=0,invert=on,tooth=0,toothscale=3\n' +
    'tone: diffuse=0.85,ambient=0.05,wrap=0.5,rim=1,rimpow=3.5,rimbias=0.35,contact=1,shape=0.6,black=0,white=1.2,hl=0.86,hlsoft=0.05,gamma=2.4,speccut=0,strength=1,curve=1,levels=0\n' +
    'ink: mode=ink,base=paper,ink=albedo,inkcolor=#000000,papercolor=#f0ecdd,mincontrast=0.15,inkshade=0.4,tonefog=on,albedoquant=0\n';

describe('parseHatchSpec', () => {
    it('types every section of a style text', () => {
        const spec = parseHatchSpec(RICHARDSON);
        expect(spec.layers).toHaveLength(2);
        const [line, dot] = spec.layers;
        expect(line.kind).toBe('line');
        expect(line.width).toBe(0.45);
        expect(line.wjitter).toBe(0.45);
        expect(line.fade).toBe(0);
        expect(dot.kind).toBe('dot');
        expect(dot.dotscale).toBe(1);
        expect(dot.invert).toBe(true);
        expect(spec.tone.wrap).toBe(0.5);
        expect(spec.tone.strength).toBe(1);
        expect(spec.tone.levels).toBe(0);
        expect(spec.ink.papercolor).toBe('#f0ecdd');
        expect(spec.ink.ink).toBe('albedo');
        expect(spec.ink.inkshade).toBe(0.4);
        expect(spec.ink.tonefog).toBe(true);
    });

    it('fills missing keys with the defaults and keeps unknown keys in extra', () => {
        const spec = parseHatchSpec('layer: kind=dot,newkey=7\ntone: strength=2,future=x');
        expect(spec.layers[0].dotscale).toBe(1);
        expect(spec.layers[0].angle).toBe(45);
        expect(spec.layers[0].invert).toBe(true);
        expect(spec.layers[0].extra).toEqual({ newkey: '7' });
        expect(spec.tone.strength).toBe(2);
        expect(spec.tone.curve).toBe(DEFAULT_HATCH_TONE.curve);
        expect(spec.tone.extra).toEqual({ future: 'x' });
        // ... and re-emits them on the way out.
        const text = formatHatchSpec(spec);
        expect(text).toContain('newkey=7');
        expect(text).toContain('future=x');
    });

    it('accepts every boolean spelling', () => {
        expect(parseHatchSpec('layer: kind=dot,invert=1').layers[0].invert).toBe(true);
        expect(parseHatchSpec('layer: kind=dot,invert=false').layers[0].invert).toBe(false);
        expect(parseHatchSpec('ink: tonefog=off').ink.tonefog).toBe(false);
    });

    it('skips blank lines, comments and unknown sections; ";" separates too', () => {
        const spec = parseHatchSpec('# a comment\n\nbogus: x=1\nlayer: kind=line; tone: strength=2');
        expect(spec.layers).toHaveLength(1);
        expect(spec.tone.strength).toBe(2);
    });

    it('an empty text is no layers and the default tone', () => {
        const spec = parseHatchSpec('');
        expect(spec.layers).toEqual([]);
        expect(spec.tone.strength).toBe(1);
    });
});

describe('formatHatchSpec', () => {
    it('round-trips a style text (format(parse(x)) is a fixed point)', () => {
        const once = formatHatchSpec(parseHatchSpec(RICHARDSON));
        const twice = formatHatchSpec(parseHatchSpec(once));
        expect(twice).toBe(once);
        expect(once.split('\n').filter((l) => l.startsWith('layer:'))).toHaveLength(2);
        expect(once).toContain('tone: ');
        expect(once).toContain('ink: ');
    });

    it('writes numbers without float noise', () => {
        const layer = newHatchLayer('line', 'a');
        layer.width = 0.1 + 0.2;
        expect(formatHatchLayersSpec([layer])).toContain('width=0.3,');
    });

    it('filters the layer keys by kind', () => {
        const line = formatHatchLayersSpec([newHatchLayer('line', 'a')]);
        expect(line).toContain('width=');
        expect(line).toContain('wobble=');
        expect(line).not.toContain('dotscale=');
        expect(line).not.toContain('shape=');
        const dot = formatHatchLayersSpec([newHatchLayer('dot', 'b')]);
        expect(dot).toContain('dotscale=');
        expect(dot).toContain('invert=on');
        expect(dot).not.toContain('width=');
        expect(dot).not.toContain('wobble=');
        const stipple = formatHatchLayersSpec([newHatchLayer('stipple', 'c')]);
        expect(stipple).toContain('dotscale=');
        expect(stipple).not.toContain('invert=');
    });

    it('isSameHatchSpec ignores layer ids; cloneHatchSpec renews them', () => {
        const spec = parseHatchSpec(RICHARDSON);
        const copy = cloneHatchSpec(spec);
        expect(copy.layers[0].id).not.toBe(spec.layers[0].id);
        expect(isSameHatchSpec(spec, copy)).toBe(true);
        copy.layers[0].width = 2;
        expect(isSameHatchSpec(spec, copy)).toBe(false);
    });
});

// Fields another value switches off are reported disabled (umbreon's
// hatch_ink.hpp is the reference for each rule).
describe('field enabling', () => {
    it('layer fields', () => {
        const line = newHatchLayer('line', 'a');
        // Continuous line, no wobble, no tooth, no jitter: nothing to seed.
        expect(layerFieldEnabled('seed', line)).toBe(false);
        expect(layerFieldEnabled('sgap', line)).toBe(false);
        expect(layerFieldEnabled('wobwave', line)).toBe(false);
        expect(layerFieldEnabled('toothscale', line)).toBe(false);
        line.slen = 40;
        expect(layerFieldEnabled('sgap', line)).toBe(true);
        expect(layerFieldEnabled('seed', line)).toBe(true);
        line.wjitter = 0.3;
        expect(layerFieldEnabled('wobwave', line)).toBe(true);
        // No nesting and a fixed fade: toneLo never gates a mark.
        line.subdiv = 0;
        line.fade = 16;
        expect(layerFieldEnabled('tonelo', line)).toBe(false);
        line.fade = 0;
        expect(layerFieldEnabled('tonelo', line)).toBe(true);
        const dot = newHatchLayer('dot', 'b');
        expect(layerFieldEnabled('dotangle', dot)).toBe(false);
        dot.shape = 16;
        expect(layerFieldEnabled('dotangle', dot)).toBe(true);
        const stipple = newHatchLayer('stipple', 'c');
        expect(layerFieldEnabled('seed', stipple)).toBe(true);
        expect(layerFieldEnabled('tonelo', stipple)).toBe(true);
    });

    it('tone and ink fields', () => {
        const env = { aoEnabled: false, baseIsAlbedo: false };
        const tone = { ...DEFAULT_HATCH_TONE };
        expect(toneFieldEnabled('hlsoft', tone, env)).toBe(false);
        expect(toneFieldEnabled('rimpow', tone, env)).toBe(false);
        expect(toneFieldEnabled('contact', tone, env)).toBe(false);
        expect(toneFieldEnabled('strength', tone, env)).toBe(true);
        tone.hl = 0.86;
        tone.rim = 1;
        expect(toneFieldEnabled('hlsoft', tone, env)).toBe(true);
        expect(toneFieldEnabled('rimbias', tone, env)).toBe(true);
        expect(toneFieldEnabled('shape', tone, { ...env, aoEnabled: true })).toBe(true);
        expect(inkFieldEnabled('albedoquant', DEFAULT_HATCH_INK, env)).toBe(false);
        expect(inkFieldEnabled('albedoquant', DEFAULT_HATCH_INK, { ...env, baseIsAlbedo: true })).toBe(true);
    });
});
