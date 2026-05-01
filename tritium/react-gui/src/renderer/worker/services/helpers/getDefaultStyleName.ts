export function getDefaultStyleName(rendererType: string): string {
    switch (rendererType) {
        case 'tube':
        case 'spline':
            return 'DefaultHSCPaint';
        case 'ribbon':
            return 'DefaultRibbon,DefaultHSCPaint';
        case 'cartoon':
            return 'DefaultCartoon,DefaultHSCPaint';
        case 'nucl':
            return 'DefaultNucl';
        case 'anisou':
            return 'DefaultAnIsoU,DefaultCPKColoring';
        case 'ballstick':
            return 'DefaultBallStick,DefaultCPKColoring';
        case 'cpk':
            return 'DefaultCPK,DefaultCPKColoring';
        case 'contour':
            return 'DefaultContour';
        case 'isosurf':
            return 'DefaultIsoSurf';
        default:
            return 'DefaultCPKColoring';
    }
}
