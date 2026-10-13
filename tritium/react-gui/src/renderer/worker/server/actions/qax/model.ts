/**
 * @file worker/server/actions/qax/model.ts
 * @description The content of a qax file (CueMol actions, XML), as plain
 * data.
 *
 * A qax file is a list of actions; each action is one undo transaction and
 * holds, in order, what it ran:
 *
 *   <cuemol-actions version="1">
 *     <action label="Change property: width" source="gui" time="...">
 *       <op name="set_node_prop">
 *         <arg name="nodeType">renderer</arg>
 *         <arg name="nodeId" path="1crn/cartoon1" uid="12"/>
 *         <arg name="prop">width</arg>
 *         <arg name="value">2</arg>
 *       </op>
 *       <cmd>zoom 1crn</cmd>
 *       <note>no op for this edit</note>
 *     </action>
 *   </cuemol-actions>
 *
 * The structure is generic; what arguments an op takes and their types are
 * the op catalogue's, checked when the file is run. This module and the
 * reader / writer beside it depend on nothing else in the worker, so the
 * format can be implemented again elsewhere (in C++) against the same files.
 *
 * A file can also define macros: named actions with parameters, run on
 * what the caller binds them to. An argument takes a parameter's value with
 * `param`, and a renderer under the object a parameter names with `param`
 * plus `sub` (the renderer's name, e.g. one the macro created itself):
 *
 *   <macro name="cartoon" label="Cartoon" description="...">
 *     <param name="mol" type="MolCoord" label="Target"/>
 *     <op name="create_renderer">
 *       <arg name="objId" param="mol"/>
 *       <arg name="rendererType">cartoon</arg>
 *       <arg name="name">p_cartoon</arg>
 *     </op>
 *     <op name="set_renderer_coloring">
 *       <arg name="nodeId" param="mol" sub="p_cartoon"/>
 *       ...
 *   </macro>
 *
 * A parameter's `type` is a qif class name, as a qsc file names an object's
 * class (`MolCoord`, `Object`).
 */

/** The only version written and read. */
export const QAX_VERSION = 1

/** The root element. */
export const QAX_ROOT = 'cuemol-actions'

/** The file extension. */
export const QAX_EXT = '.qax'

/** One atom of an `atoms` argument. */
export interface QaxAtom {
  chain: string
  resid: string
  name: string
}

/**
 * One argument of an op. Exactly one way of giving the value is used:
 *
 * - `text`: a scalar written out (a boolean, a number, a string, `x y z`);
 * - `path` / `uid`: a node, by its path in the scene and its uid in the
 *   session that wrote the file (the path is what is looked up; the uid only
 *   when there is no path);
 * - `atoms`: a list of atoms.
 */
export interface QaxArg {
  name: string
  text?: string
  path?: string
  uid?: number
  atoms?: QaxAtom[]
  /** In a macro: the parameter whose value this is. */
  param?: string
  /** With `param`: the renderer of that name under the object it names. */
  sub?: string
}

export type QaxItem =
  | { kind: 'op'; name: string; args: QaxArg[] }
  /** A native console command line, run by the console's parser. */
  | { kind: 'cmd'; text: string }
  /** Kept for the reader; not run. */
  | { kind: 'note'; text: string }

export interface QaxAction {
  label?: string
  source?: string
  time?: string
  items: QaxItem[]
}

/** One parameter of a macro. */
export interface QaxParam {
  name: string
  /** The qif class of the object it takes (`MolCoord`, `Object`). */
  type: string
  label?: string
}

/** A named action with parameters; run as one undo transaction. */
export interface QaxMacro {
  name: string
  label?: string
  description?: string
  params: QaxParam[]
  items: QaxItem[]
}

export interface QaxDoc {
  version: number
  actions: QaxAction[]
  /** Macros the file defines; left out when it defines none. */
  macros?: QaxMacro[]
}
