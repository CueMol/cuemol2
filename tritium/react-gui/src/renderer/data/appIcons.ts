/**
 * @file data/appIcons.ts
 * @description Central registry mapping semantic icon keys to a concrete icon
 * renderer. This is the single place that decides whether an icon comes from
 * Phosphor (`@phosphor-icons/react`) or Blueprint (`@blueprintjs/icons`), so
 * the rest of the app references stable keys via {@link AppIcon} and the
 * library choice can change here without touching consumers.
 *
 * Migration policy: prefer Phosphor for hand-picked / domain-specific icons
 * (molecular tools etc.); keep Blueprint entries for icons that already fit.
 * Keys are added here as each consumer is migrated (so the bundle only carries
 * icons that are actually used).
 *
 * @module data/appIcons
 */

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import {
  Angle,
  ArrowClockwise,
  ArrowsClockwise,
  ArrowsOutCardinal,
  ArrowUUpLeft,
  CaretDown,
  CaretRight,
  Check,
  Circle,
  CloudArrowDown,
  CornersOut,
  Cube,
  Drop,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  File,
  FilmStrip,
  FloppyDisk,
  FloppyDiskBack,
  FolderOpen,
  Funnel,
  Gear,
  Image,
  Lasso,
  Plus,
  Ruler,
  Selection,
  SlidersHorizontal,
  SquaresFour,
  Terminal,
  TextAlignLeft,
  TreeStructure,
  Wrench,
  X,
} from "@phosphor-icons/react";
import type { IconName } from "@blueprintjs/icons";

/** A registry entry: either a Phosphor component or a Blueprint icon name. */
export type AppIconSpec =
  | { lib: "phosphor"; Comp: PhosphorIcon; weight?: IconWeight }
  | { lib: "bp"; name: IconName };

/**
 * Semantic icon registry. Keys are namespaced by area (`tool.*`, `activity.*`,
 * `toolbar.*`, `panel.*`) or `ui.*` for generic reusable icons. Add an entry
 * here, then reference it via `<AppIcon name="..." />`.
 */
export const APP_ICONS = {
  // Viewport tools.
  "tool.navigate": { lib: "phosphor", Comp: ArrowsOutCardinal },
  "tool.rectSelect": { lib: "phosphor", Comp: Selection },
  "tool.lasso": { lib: "phosphor", Comp: Lasso },
  "tool.distance": { lib: "phosphor", Comp: Ruler },
  "tool.angle": { lib: "phosphor", Comp: Angle },
  "tool.torsion": { lib: "phosphor", Comp: ArrowsClockwise },

  // Activity bar (rendered bold by the consumer).
  "activity.explorer": { lib: "phosphor", Comp: TreeStructure },
  "activity.selection": { lib: "phosphor", Comp: Selection },
  "activity.crystal": { lib: "phosphor", Comp: Cube },
  "activity.catalog": { lib: "phosphor", Comp: SquaresFour },
  "activity.settings": { lib: "phosphor", Comp: Gear },

  // Top toolbar.
  "toolbar.newTab": { lib: "phosphor", Comp: Plus },
  "toolbar.openFile": { lib: "phosphor", Comp: File },
  "toolbar.save": { lib: "phosphor", Comp: FloppyDisk },
  "toolbar.saveAs": { lib: "phosphor", Comp: FloppyDiskBack },
  "toolbar.openScene": { lib: "phosphor", Comp: FolderOpen },
  "toolbar.reloadScene": { lib: "phosphor", Comp: ArrowClockwise },
  "toolbar.saveScene": { lib: "phosphor", Comp: FloppyDisk },
  "toolbar.getPdb": { lib: "phosphor", Comp: CloudArrowDown },
  "toolbar.render": { lib: "phosphor", Comp: Image },

  // Bottom panel tabs.
  "panel.output": { lib: "phosphor", Comp: Terminal },
  "panel.sequence": { lib: "phosphor", Comp: TextAlignLeft },
  "panel.animation": { lib: "phosphor", Comp: FilmStrip },
  "panel.render": { lib: "phosphor", Comp: Image },

  // Generic reusable UI icons.
  "ui.refresh": { lib: "phosphor", Comp: ArrowClockwise },
  "ui.statusDot": { lib: "phosphor", Comp: Circle, weight: "fill" },
  "ui.properties": { lib: "phosphor", Comp: SlidersHorizontal },
  "ui.close": { lib: "phosphor", Comp: X },
  "ui.caretRight": { lib: "phosphor", Comp: CaretRight },
  "ui.caretDown": { lib: "phosphor", Comp: CaretDown },
  "ui.check": { lib: "phosphor", Comp: Check },
  "ui.cube": { lib: "phosphor", Comp: Cube },
  "ui.tint": { lib: "phosphor", Comp: Drop },
  "ui.widget": { lib: "phosphor", Comp: SquaresFour },
  "ui.wrench": { lib: "phosphor", Comp: Wrench },
  "ui.filter": { lib: "phosphor", Comp: Funnel },
  "ui.undo": { lib: "phosphor", Comp: ArrowUUpLeft },
  "ui.zoomIn": { lib: "phosphor", Comp: MagnifyingGlassPlus },
  "ui.zoomOut": { lib: "phosphor", Comp: MagnifyingGlassMinus },
  "ui.zoomToFit": { lib: "phosphor", Comp: CornersOut },
} as const satisfies Record<string, AppIconSpec>;

export type AppIconKey = keyof typeof APP_ICONS;
