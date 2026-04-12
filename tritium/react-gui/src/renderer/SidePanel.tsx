import React, { useState, useLayoutEffect } from 'react'
import styles from './SidePanel.module.css'
import { useMolTabState } from './hooks/useMolTab'
import { SceneTree, defaultTree, createSceneTreeByViewID } from './SceneTree'
// import * as event from './event'
// import { cuemol_worker } from './cuemol_worker'

// function useSceneEvent(callback: (args: any) => void, view_id: number | null): void {
//   useEffect(() => {
//     if (view_id === null) {
//       console.log('UseSceneEvent skip:', view_id)
//       return () => {}
//     }
//
//     let cbid: number
//     ;(async () => {
//       const scene_id = await cuemol_worker.getSceneByView(view_id)
//       cbid = await cuemol_worker.addEventListener(
//         '',
//         event.SEM_SCENE | event.SEM_OBJECT | event.SEM_RENDERER | event.SEM_CAMERA | event.SEM_STYLE,
//         event.SEM_ANY,
//         scene_id,
//         callback
//       )
//       console.log('UseSceneEvent addEventListerner:', cbid, scene_id)
//     })()
//
//     return () => {
//       console.log('UseSceneEvent removeEventListerner:', cbid)
//       cuemol_worker.removeEventListener(cbid)
//     }
//   }, [view_id])
// }

const updateTreeByViewID = async (view_id: number | null, setter_fn: (tree: any) => void): Promise<void> => {
  if (view_id === null) return
  console.log('SidePanel calling updateTreeByViewID...')
  const tree = await createSceneTreeByViewID(view_id)
  console.log('SidePanel updateTreeByViewID', tree)
  if (tree !== null) {
    setter_fn(tree)
  }
}

export function SidePanel(): React.JSX.Element {
  const { activeViewID } = useMolTabState()
  const [treeData, setTreeData] = useState(defaultTree)

  useLayoutEffect(() => {
    console.log('SidePanel useLayoutEffect activeViewID', activeViewID)
    updateTreeByViewID(activeViewID, setTreeData)
  }, [activeViewID])

  // useSceneEvent((args) => { ... }, activeViewID)

  return (
    <div className={styles.sidePanel}>
      <button onClick={() => updateTreeByViewID(activeViewID, setTreeData)}>Update</button>
      <SceneTree treeData={treeData} />
    </div>
  )
}
