/**
 * @file plugins/pymconsole/worker/commands/pymolColors.ts
 * @description PyMOL's named colours, as hex.
 *
 * CueMol's `ColCompiler` understands CSS colour names and `#rrggbb`, which
 * covers a lot of what PyMOL accepts -- but not all of it, and not always
 * with the same value. PyMOL ships names CSS has no idea about (`tv_red`,
 * `marine`, `smudge`, the element colours) and it also REDEFINES some CSS
 * names: its `aquamarine` is (0.5, 1, 1), not CSS's #7FFFD4.
 *
 * So every name PyMOL defines literally is tabled here and wins, and anything
 * not in the table is handed to `ColCompiler` unchanged -- which keeps CSS
 * names PyMOL never defined working.
 *
 * Generated from `layer1/Color.cpp` `reg_named_color()` calls, rounded to 8
 * bits per channel. The generated ramps in that file are handled separately:
 * `greyNN` / `grayNN` are computed, and the 1000-entry spectrum ramps
 * (`sNNN` / `rNNN` / `cNNN` / `wNNN` / `oNNN`) are not supported.
 */

/** Every colour PyMOL registers by name, lower-case, as `#rrggbb`. */
export const PYMOL_COLORS: Readonly<Record<string, string>> = {
  actinium: '#70abfa',
  aluminum: '#bfa6a6',
  americium: '#545cf2',
  antimony: '#9e63b5',
  aquamarine: '#80ffff',
  argon: '#80d1e3',
  arsenic: '#bd80e3',
  astatine: '#754f45',
  barium: '#00c900',
  berkelium: '#8a4fe3',
  beryllium: '#c2ff00',
  bismuth: '#9e4fb5',
  black: '#000000',
  blue: '#0000ff',
  bluewhite: '#d9d9ff',
  bohrium: '#e00038',
  boron: '#ffb5b5',
  br0: '#1a1aff',
  br1: '#331ae6',
  br2: '#4c1acc',
  br3: '#661ab2',
  br4: '#801a99',
  br5: '#991a80',
  br6: '#b21a66',
  br7: '#cc1a4c',
  br8: '#e61a33',
  br9: '#ff1a1a',
  brightorange: '#ffb233',
  bromine: '#a62929',
  brown: '#a6522b',
  cadmium: '#ffd98f',
  calcium: '#3dff00',
  californium: '#a136d4',
  carbon: '#33ff33',
  cerium: '#ffffc7',
  cesium: '#57178f',
  chartreuse: '#80ff00',
  chlorine: '#1ff01f',
  chocolate: '#8e391c',
  chromium: '#8a99c7',
  cobalt: '#f090a0',
  copper: '#c88033',
  curium: '#785ce3',
  cyan: '#00ffff',
  darksalmon: '#ba8c85',
  dash: '#ffff00',
  deepblue: '#4040a6',
  deepolive: '#99991a',
  deeppurple: '#991a99',
  deepsalmon: '#ff8080',
  deepteal: '#1a9999',
  density: '#1a1a99',
  deuterium: '#e6e6e6',
  dirtyviolet: '#b28080',
  dubnium: '#d1004f',
  dysprosium: '#1fffc7',
  einsteinium: '#b31fd4',
  erbium: '#00e675',
  europium: '#61ffc7',
  fermium: '#b31fba',
  firebrick: '#b22121',
  fluorine: '#b3ffff',
  forest: '#339933',
  francium: '#420066',
  gadolinium: '#45ffc7',
  gallium: '#c28f8f',
  germanium: '#668f8f',
  gold: '#ffd123',
  gray: '#808080',
  green: '#00ff00',
  greencyan: '#40ffbf',
  grey: '#808080',
  hafnium: '#4dc2ff',
  hassium: '#e6002e',
  helium: '#d9ffff',
  holmium: '#00ff9c',
  hotpink: '#ff0080',
  hydrogen: '#e6e6e6',
  indium: '#a67573',
  iodine: '#940094',
  iridium: '#175487',
  iron: '#e06633',
  krypton: '#5cb8d1',
  lanthanum: '#70d4ff',
  lawrencium: '#c70066',
  lead: '#575961',
  lightblue: '#bfbfff',
  lightmagenta: '#ff33cc',
  lightorange: '#ffcc80',
  lightpink: '#ffbfde',
  lightteal: '#66b2b2',
  lime: '#80ff80',
  limegreen: '#00ff80',
  limon: '#bfff40',
  lithium: '#cc80ff',
  lonepair: '#808080',
  lutetium: '#00ab24',
  magenta: '#ff00ff',
  magnesium: '#8aff00',
  manganese: '#9c7ac7',
  marine: '#0080ff',
  meitnerium: '#eb0026',
  mendelevium: '#b30da6',
  mercury: '#b8b8d0',
  molybdenum: '#54b5b5',
  neodymium: '#c7ffc7',
  neon: '#b3e3f5',
  neptunium: '#0080ff',
  nickel: '#50d050',
  niobium: '#73c2c9',
  nitrogen: '#3333ff',
  nobelium: '#bd0d87',
  olive: '#c4b200',
  orange: '#ff8000',
  osmium: '#266696',
  oxygen: '#ff4c4c',
  palecyan: '#ccffff',
  palegreen: '#a6e6a6',
  paleyellow: '#ffff80',
  palladium: '#006985',
  phosphorus: '#ff8000',
  pink: '#ffa6d9',
  platinum: '#d0d0e0',
  plutonium: '#006bff',
  polonium: '#ab5c00',
  potassium: '#8f40d4',
  praseodymium: '#d9ffc7',
  promethium: '#a3ffc7',
  protactinium: '#00a1ff',
  pseudoatom: '#e6e6e6',
  purple: '#bf00bf',
  purpleblue: '#8000ff',
  radium: '#007d00',
  radon: '#428296',
  raspberry: '#b24c66',
  red: '#ff0000',
  rhenium: '#267dab',
  rhodium: '#0a7d8c',
  rubidium: '#702eb0',
  ruby: '#993333',
  ruthenium: '#248f8f',
  rutherfordium: '#cc0059',
  salmon: '#ff9999',
  samarium: '#8fffc7',
  sand: '#b88c4c',
  scandium: '#e6e6e6',
  seaborgium: '#d90045',
  selenium: '#ffa100',
  silicon: '#f0c8a0',
  silver: '#c0c0c0',
  skyblue: '#3380cc',
  slate: '#8080ff',
  smudge: '#8cb266',
  sodium: '#ab5cf2',
  splitpea: '#85bf00',
  strontium: '#00ff00',
  sulfur: '#e6c640',
  tantalum: '#4da6ff',
  teal: '#00bfbf',
  technetium: '#3b9e9e',
  tellurium: '#d47a00',
  terbium: '#30ffc7',
  thallium: '#a6544d',
  thorium: '#00baff',
  thulium: '#00d452',
  tin: '#668080',
  titanium: '#bfc2c7',
  tungsten: '#2194d6',
  'tv_blue': '#4c4cff',
  'tv_green': '#33ff33',
  'tv_orange': '#ff8c26',
  'tv_red': '#ff3333',
  'tv_yellow': '#ffff33',
  uranium: '#008fff',
  vanadium: '#a6a6ab',
  violet: '#ff80ff',
  violetpurple: '#8c4099',
  warmpink: '#d93380',
  wheat: '#fcd1a6',
  white: '#ffffff',
  xenon: '#429eb0',
  yellow: '#ffff00',
  yelloworange: '#ffde5e',
  ytterbium: '#00bf38',
  yttrium: '#94ffff',
  zinc: '#7d80b0',
  zirconium: '#94e0e0',
}

/** PyMOL's generated greyscale ramps: `grey00`..`grey99` and the `gray` spelling. */
const GREY_RE = /^gr[ae]y(\d\d)$/

/** PyMOL's 1000-entry spectrum ramps, which this console does not carry. */
const SPECTRUM_RE = /^[srcwo]\d\d\d$/

/**
 * A PyMOL colour name as something CueMol's `ColCompiler` will accept.
 *
 * @returns the colour, or null when the name is one PyMOL has and this
 *   console does not. A name neither side defines is passed through, so
 *   `#204080` and CSS names still reach C++.
 */
export function toCueMolColor(name: string): string | null {
  const key = name.trim().toLowerCase()
  if (key === '') return null
  const known = PYMOL_COLORS[key]
  if (known !== undefined) return known
  const grey = GREY_RE.exec(key)
  if (grey) {
    // grey00..grey99 is a linear ramp over 0..99/99 (Color.cpp:1081-1086).
    const level = Math.round((Number(grey[1]) / 99) * 255)
    const hh = level.toString(16).padStart(2, '0')
    return `#${hh}${hh}${hh}`
  }
  if (SPECTRUM_RE.test(key)) return null
  return name.trim()
}
