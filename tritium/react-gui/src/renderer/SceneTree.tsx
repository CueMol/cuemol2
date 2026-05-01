import React, { useState } from 'react'
import { ControlledTreeEnvironment, Tree, TreeItem, TreeItemIndex } from 'react-complex-tree'
import 'react-complex-tree/lib/style.css'
// import { cuemol_worker } from './cuemol_worker'

export const defaultTree: Record<string, TreeItem<string>> = {
  root: {
    index: 'root',
    canMove: false,
    hasChildren: true,
    children: ['1'],
    data: 'root',
    canRename: false,
  },
  '1': {
    index: '1',
    canMove: false,
    hasChildren: false,
    children: undefined,
    data: 'Empty scene',
    canRename: false,
  },
}

const convTree = (data: any[]): Record<string, TreeItem<string>> => {
  const result: Record<string, TreeItem<string>> = {}
  const nlen = data.length
  const scene = data[0]
  result[scene.ID.toString()] = {
    index: scene.ID.toString(),
    canMove: false,
    hasChildren: false,
    children: undefined,
    data: scene.name,
    canRename: false,
  }

  const objItems: string[] = []
  for (let i = 1; i < nlen; ++i) {
    const obj = data[i]
    const rendInds: string[] = []
    if (obj.rends && obj.rends.length > 0) {
      for (const rend of obj.rends) {
        result[rend.ID.toString()] = {
          index: rend.ID.toString(),
          canMove: false,
          hasChildren: false,
          children: undefined,
          data: rend.name,
          canRename: false,
        }
        rendInds.push(rend.ID.toString())
      }
    }
    result[obj.ID.toString()] = {
      index: obj.ID.toString(),
      canMove: false,
      hasChildren: rendInds.length > 0,
      children: rendInds.length > 0 ? rendInds : undefined,
      data: obj.name,
      canRename: false,
    }
    objItems.push(obj.ID.toString())
  }

  result['root'] = {
    index: 'root',
    canMove: false,
    hasChildren: true,
    children: [scene.ID.toString(), ...objItems],
    data: 'root',
    canRename: false,
  }

  console.log('conv result:', result)
  return result
}

export const createSceneTreeByViewID = async (_view_id: number): Promise<Record<string, TreeItem<string>> | null> => {
  // TODO: restore when cuemol_worker is re-enabled
  // const scene_id = await cuemol_worker.getSceneByView(view_id)
  // const data = await cuemol_worker.getSceneData(scene_id)
  // if (!data || data.length === 0) return null
  // return convTree(data)
  return null
}

export function SceneTree({ treeData }: { treeData: Record<string, TreeItem<string>> }): React.JSX.Element {
  const [focusedItem, setFocusedItem] = useState<TreeItemIndex | undefined>(undefined)
  const [expandedItems, setExpandedItems] = useState<TreeItemIndex[]>([])
  const [selectedItems, setSelectedItems] = useState<TreeItemIndex[]>([])

  return (
    <ControlledTreeEnvironment
      items={treeData}
      getItemTitle={(item) => item.data}
      viewState={{
        'tree-1': {
          focusedItem,
          expandedItems,
          selectedItems,
        },
      }}
      onFocusItem={(item) => setFocusedItem(item.index)}
      onExpandItem={(item) => setExpandedItems([...expandedItems, item.index])}
      onCollapseItem={(item) =>
        setExpandedItems(expandedItems.filter((idx) => idx !== item.index))
      }
      onSelectItems={(items) => setSelectedItems(items)}
    >
      <Tree treeId="tree-1" rootItem="root" treeLabel="Tree Example" />
    </ControlledTreeEnvironment>
  )
}
