// Port of uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/styleutil.js.
//
// CueMol renderer style strings are comma/whitespace-separated lists of
// style names (e.g. "DefaultCartoon,DefaultHSCPaint"). These helpers
// manipulate that list as a string at both ends; ordering is meaningful
// because applyStyles processes from left to right.

function split(styleNames: string): string[] {
    return styleNames.split(/[,\s]/);
}

export function contains(styleNames: string, name: string): boolean {
    return split(styleNames).some((e) => e === name);
}

/** Remove every entry matching `re`. */
export function remove(styleNames: string, re: RegExp): string {
    return split(styleNames).filter((e) => !re.test(e)).join(',');
}

/** Append `val` to the end (last applied). */
export function push(styleNames: string, val: string): string {
    const ary = split(styleNames);
    ary.push(val);
    return ary.join(',');
}

export function pop(styleNames: string): string {
    const ary = split(styleNames);
    ary.pop();
    return ary.join(',');
}

/** Prepend `val` to the front (first applied). */
export function unshift(styleNames: string, val: string): string {
    const ary = split(styleNames);
    ary.unshift(val);
    return ary.join(',');
}

export function shift(styleNames: string): string {
    const ary = split(styleNames);
    ary.shift();
    return ary.join(',');
}
