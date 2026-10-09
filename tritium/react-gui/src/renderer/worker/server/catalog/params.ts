/**
 * @file worker/server/catalog/params.ts
 * @description The parameter vocabulary of an op.
 *
 * One declaration has to serve three readers: the JSON Schema a model (or an
 * MCP client) is sent, the TypeScript type of the arguments `run` receives,
 * and the text a console user types. That is why the vocabulary is closed
 * and small rather than a general schema library: every kind here is one a
 * console can read back from a string, which is the condition for generating
 * console commands at all.
 *
 * The scalar kinds are named after the `.qif` property types (`boolean`,
 * `integer`, `real`, `string`, `enum`), so an op parameter and the C++
 * property it ends up writing speak the same language. The `object<X>` types
 * a `.qif` file uses map onto the semantic kinds below: a uid that names a
 * node, a selection, a colour, a path.
 */

/** The `.qif` scalar types, plus the one structured kind ops need. */
export type ParamKind = 'boolean' | 'integer' | 'real' | 'string' | 'enum' | 'vec3' | 'atoms'

/**
 * What a value means beyond its type.
 *
 * A model is given uids (from `get_scene_state`), while a console user types
 * names; the semantic kind is what lets the console turn one into the other,
 * and what completion offers.
 */
export type ParamSemantic =
  | 'object'
  | 'molecule'
  | 'renderer'
  | 'node'
  | 'selection'
  | 'color'
  | 'path'
  | 'rendererType'
  | 'propName'
  | 'propPath'
  | 'propValue'

/** One atom named the way a PDB file names it. */
export interface AtomSpec {
  chain: string
  resid: string
  atomName: string
}

/**
 * One parameter.
 *
 * `T` is the type `run` receives; it exists only for inference.
 */
export interface Param<T> {
  readonly kind: ParamKind
  readonly description: string
  /** Null may be passed; the JSON Schema spells it as a nullable type. */
  readonly optional: boolean
  /** The allowed values of an `enum`. */
  readonly values?: readonly string[]
  readonly semantic?: ParamSemantic
  /**
   * For a `node` uid: the parameter that says what the uid refers to. A
   * console resolves a name to both, so it may leave that one out.
   */
  readonly typeParam?: string
  /** Phantom, for `ArgsOf`. Never set. */
  readonly __type?: T
}

/** The parameters of an op, in order. The order is the console's positional order. */
export type ParamMap = Readonly<Record<string, Param<unknown>>>

/** The argument object `run` receives for a parameter map. */
export type ArgsOf<P extends ParamMap> = {
  [K in keyof P]: P[K] extends Param<infer T> ? T : never
}

function param<T>(kind: ParamKind, description: string, extra: Partial<Param<T>> = {}): Param<T> {
  return { kind, description, optional: false, ...extra }
}

// --- scalar kinds (the .qif names) ---

export function boolean(description: string): Param<boolean> {
  return param('boolean', description)
}

export function integer(description: string): Param<number> {
  return param('integer', description)
}

export function real(description: string): Param<number> {
  return param('real', description)
}

export function string(description: string): Param<string> {
  return param('string', description)
}

/** An enumerated string. Like a `.qif` enum, the values are string ids. */
export function enumOf<const V extends readonly string[]>(values: V, description: string): Param<V[number]> {
  return param('enum', description, { values })
}

/** A parameter that may be null. */
export function optional<T>(p: Param<T>): Param<T | null> {
  return { ...p, optional: true } as Param<T | null>
}

// --- semantic kinds (the .qif object<X> types) ---

/** Uid of any object (`object<Object>`). */
export function objectId(description: string): Param<number> {
  return param('integer', description, { semantic: 'object' })
}

/** Uid of a molecule (`object<MolCoord>`). */
export function moleculeId(description: string): Param<number> {
  return param('integer', description, { semantic: 'molecule' })
}

/** Uid of a renderer or renderer group (`object<Renderer>`). */
export function rendererId(description: string): Param<number> {
  return param('integer', description, { semantic: 'renderer' })
}

/**
 * Uid of an object, renderer or renderer group, with `typeParam` naming the
 * enum parameter that says which.
 */
export function nodeId(description: string, typeParam: string): Param<number> {
  return param('integer', description, { semantic: 'node', typeParam })
}

/** A CueMol selection expression (`object<MolSelection>`). */
export function selection(description: string): Param<string> {
  return param('string', description, { semantic: 'selection' })
}

/** A colour: a name, `#rrggbb`, or `hsb(...)` (`object<AbstractColor>`). */
export function color(description: string): Param<string> {
  return param('string', description, { semantic: 'color' })
}

/**
 * A renderer type name (`cartoon`, `ball`, ...). What is valid depends on the
 * object it is created on, which is why completion reads it from there.
 */
export function rendererType(description: string): Param<string> {
  return param('string', description, { semantic: 'rendererType' })
}

/**
 * The name of a property of the node another parameter names. What is valid
 * depends on that node, which is why completion reads it from there.
 */
export function propName(description: string): Param<string> {
  return param('string', description, { semantic: 'propName' })
}

/**
 * A property named by its path from the scene: `obj/rend.prop`,
 * `obj.prop`, or a bare scene property (see
 * `resolvePropPath`). For a person at a prompt; a model is given uids.
 */
export function propPath(description: string): Param<string> {
  return param('string', description, { semantic: 'propPath' })
}

/**
 * A value for the property another parameter names, as text; it is converted
 * by the property's own `.qif` type when written.
 */
export function propValue(description: string): Param<string> {
  return param('string', description, { semantic: 'propValue' })
}

/** A file path. */
export function path(description: string): Param<string> {
  return param('string', description, { semantic: 'path' })
}

/** A point or direction (`object<Vector>`): x, y, z. */
export function vec3(description: string): Param<[number, number, number]> {
  return param('vec3', description)
}

/** An ordered list of atoms, each named by chain, residue and atom name. */
export function atoms(description: string): Param<AtomSpec[]> {
  return param('atoms', description)
}
