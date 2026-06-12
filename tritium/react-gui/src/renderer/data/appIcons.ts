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
  ArrowDown,
  ArrowsClockwise,
  ArrowsOutCardinal,
  ArrowUp,
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  Circle,
  CloudArrowDown,
  CornersOut,
  Copy,
  Crosshair,
  Cube,
  Cursor,
  Drop,
  Eraser,
  Eye,
  EyeSlash,
  File,
  FilmStrip,
  FloppyDisk,
  FloppyDiskBack,
  FolderOpen,
  Funnel,
  Gear,
  GitBranch,
  Image,
  Lasso,
  LineSegment,
  List,
  Lock,
  LockOpen,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Minus,
  Pause,
  Play,
  Plus,
  Ruler,
  Selection,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  SquaresFour,
  Stack,
  Stop,
  Tag,
  Terminal,
  TextAlignLeft,
  TreeStructure,
  Trash,
  Wrench,
  X,
} from "@phosphor-icons/react";
// Data-layer icons (scene/struct tree nodes, tabs, settings tree, anim tracks).
import {
  ArrowSquareIn,
  ArrowsHorizontal,
  Atom,
  BracketsCurly,
  Camera,
  CircleHalf,
  Code,
  Command,
  FilmSlate,
  Folder,
  Globe,
  Hand,
  HandPointing,
  House,
  Intersect,
  Key,
  Lightning,
  Palette,
  Shield,
  TextAa,
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
  "tool.bondEdit": { lib: "phosphor", Comp: LineSegment },

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
  "ui.menu": { lib: "phosphor", Comp: List },
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
  "ui.redo": { lib: "phosphor", Comp: ArrowUUpRight },
  "ui.zoomIn": { lib: "phosphor", Comp: MagnifyingGlassPlus },
  "ui.zoomOut": { lib: "phosphor", Comp: MagnifyingGlassMinus },
  "ui.zoomToFit": { lib: "phosphor", Comp: CornersOut },
  "ui.git": { lib: "phosphor", Comp: GitBranch },
  "ui.select": { lib: "phosphor", Comp: Cursor },
  "ui.locate": { lib: "phosphor", Comp: Crosshair },
  "ui.add": { lib: "phosphor", Comp: Plus },
  "ui.remove": { lib: "phosphor", Comp: Minus },
  "ui.trash": { lib: "phosphor", Comp: Trash },
  "ui.duplicate": { lib: "phosphor", Comp: Copy },
  "ui.arrowUp": { lib: "phosphor", Comp: ArrowUp },
  "ui.arrowDown": { lib: "phosphor", Comp: ArrowDown },
  "ui.caretUp": { lib: "phosphor", Comp: CaretUp },
  "ui.caretLeft": { lib: "phosphor", Comp: CaretLeft },
  "ui.search": { lib: "phosphor", Comp: MagnifyingGlass },
  "ui.eraser": { lib: "phosphor", Comp: Eraser },
  "ui.save": { lib: "phosphor", Comp: FloppyDisk },
  "ui.settings": { lib: "phosphor", Comp: Gear },
  "ui.layers": { lib: "phosphor", Comp: Stack },
  "ui.tag": { lib: "phosphor", Comp: Tag },
  "ui.document": { lib: "phosphor", Comp: File },
  "ui.lock": { lib: "phosphor", Comp: Lock },
  "ui.unlock": { lib: "phosphor", Comp: LockOpen },
  "ui.eyeOpen": { lib: "phosphor", Comp: Eye },
  "ui.eyeClosed": { lib: "phosphor", Comp: EyeSlash },
  "ui.import": { lib: "phosphor", Comp: ArrowSquareIn },
  "ui.intersect": { lib: "phosphor", Comp: Intersect },

  // Media transport (render / animation controls).
  "media.play": { lib: "phosphor", Comp: Play },
  "media.pause": { lib: "phosphor", Comp: Pause },
  "media.stop": { lib: "phosphor", Comp: Stop },
  "media.skipBack": { lib: "phosphor", Comp: SkipBack },
  "media.skipForward": { lib: "phosphor", Comp: SkipForward },

  // Scene / structure tree node types (data-driven).
  "node.scene": { lib: "phosphor", Comp: FilmSlate },
  "node.object": { lib: "phosphor", Comp: Cube },
  "node.renderer": { lib: "phosphor", Comp: Palette },
  "node.group": { lib: "phosphor", Comp: Folder },
  "node.camera": { lib: "phosphor", Comp: Camera },
  "node.style": { lib: "phosphor", Comp: Tag },
  "node.chain": { lib: "phosphor", Comp: GitBranch },
  "node.residue": { lib: "phosphor", Comp: Cube },
  "node.atom": { lib: "phosphor", Comp: Circle, weight: "fill" },

  // Editor tabs (tab-type and file-extension driven).
  "file.welcome": { lib: "phosphor", Comp: House },
  "file.settings": { lib: "phosphor", Comp: Gear },
  "file.molview": { lib: "phosphor", Comp: Cube },
  "file.render": { lib: "phosphor", Comp: Image },
  "file.molData": { lib: "phosphor", Comp: Atom },
  "file.code": { lib: "phosphor", Comp: Code },
  "file.config": { lib: "phosphor", Comp: BracketsCurly },
  "file.document": { lib: "phosphor", Comp: File },

  // Settings category tree.
  "settings.display": { lib: "phosphor", Comp: Eye },
  "settings.theme": { lib: "phosphor", Comp: CircleHalf },
  "settings.atomLabels": { lib: "phosphor", Comp: TextAa },
  "settings.rendering": { lib: "phosphor", Comp: Cube },
  "settings.colors": { lib: "phosphor", Comp: Drop },
  "settings.input": { lib: "phosphor", Comp: Hand },
  "settings.mouse": { lib: "phosphor", Comp: ArrowsOutCardinal },
  "settings.keyboard": { lib: "phosphor", Comp: Command },
  "settings.trackpad": { lib: "phosphor", Comp: HandPointing },
  "settings.general": { lib: "phosphor", Comp: Gear },
  "settings.language": { lib: "phosphor", Comp: Globe },
  "settings.updates": { lib: "phosphor", Comp: CloudArrowDown },
  "settings.privacy": { lib: "phosphor", Comp: Shield },

  // Animation track labels.
  "track.camera": { lib: "phosphor", Comp: Camera },
  "track.style": { lib: "phosphor", Comp: Palette },
  "track.light": { lib: "phosphor", Comp: Lightning },
  "track.width": { lib: "phosphor", Comp: ArrowsHorizontal },
  "track.key": { lib: "phosphor", Comp: Key },
} as const satisfies Record<string, AppIconSpec>;

export type AppIconKey = keyof typeof APP_ICONS;
