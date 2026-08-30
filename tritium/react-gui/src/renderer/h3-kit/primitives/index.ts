/**
 * @file h3-kit/primitives/index.ts
 * @description Public surface of the kit's primitives: the pieces that carry
 * no layout or form semantics of their own and are composed by everything
 * else -- the icon registry and its renderer, and the tooltip wrapper.
 *
 * These depend on React and the icon libraries only. `AppIcon` lived under
 * `components/` until the kit itself started using it (form fields, the
 * selection builder), which pointed the design system at application code;
 * it belongs here, where both sides can reach it.
 */

export { AppIcon } from './AppIcon';
export { APP_ICONS } from './appIcons';
export type { AppIconKey, AppIconSpec } from './appIcons';
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export {
    DARK_PORTAL_CLASS,
    useDarkPortalClass,
    useIsDarkTheme,
} from './useDarkPortalClass';
