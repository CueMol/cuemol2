import { MAP_MODE_STYLES, type MapKind } from './mapRendererStyles';

/**
 * Default style list applied to a freshly created renderer of `rendererType`
 * (UXP `setDefaultStyles`). A density map renderer takes the style of the
 * kind of map it draws (`mapKind`, see `mapRendererStyles.ts`).
 */
export function getDefaultStyleName(rendererType: string, mapKind: MapKind = 'xtal'): string {
    const mapStyle = MAP_MODE_STYLES[rendererType];
    if (mapStyle) return mapStyle[mapKind];
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
        default:
            return 'DefaultCPKColoring';
    }
}
