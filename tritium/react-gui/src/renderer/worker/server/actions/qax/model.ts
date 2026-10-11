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
 * `<macro>` is reserved for named actions with parameters; version 1
 * refuses it.
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

export interface QaxDoc {
  version: number
  actions: QaxAction[]
}
