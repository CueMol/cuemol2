import React from 'react'
import { ObjectPickerDialog, type ObjectPickerEntry } from './ObjectPickerDialog'

// React import is required by the JSX runtime used at test time; do not remove.
void React
import { createDialogHook } from '../../hooks/useDialogFactory'

export interface ObjectPickerDialogArgs {
  objects: ObjectPickerEntry[]
}

export const {
  Provider: ObjectPickerDialogProvider,
  useShow: useShowObjectPicker,
} = createDialogHook<ObjectPickerDialogArgs, number | null>({
  name: 'ObjectPickerDialog',
  render: ({ visible, args, resolve }) => (
    <ObjectPickerDialog
      visible={visible}
      objects={args?.objects ?? []}
      onResult={(objId) => resolve(objId)}
    />
  ),
})
