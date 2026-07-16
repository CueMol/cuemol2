import React from 'react'
import { CalcApbsPotDialog, type CalcApbsPotDialogResult } from './CalcApbsPotDialog'
import { createConfirmCancelDialog } from '../../hooks/useDialogFactory'

// React import is required by the JSX runtime used at test time; do not remove.
void React

export interface CalcApbsPotDialogArgs {
    sceneId: number
}

export const {
    Provider: CalcApbsPotDialogProvider,
    useShow: useShowCalcApbsPotDialog,
} = createConfirmCancelDialog<CalcApbsPotDialogArgs, CalcApbsPotDialogResult>({
    name: 'CalcApbsPotDialog',
    component: CalcApbsPotDialog,
})
