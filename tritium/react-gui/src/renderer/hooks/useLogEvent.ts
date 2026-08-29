import { useEffect } from 'react'
import * as event from '../event'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useCueMolEventListener } from '@renderer/hooks/cuemol/useCueMolEventListener'

export function useLogEvent(callback: (msg: string) => void): void {
    const { cueMolReady, cm } = useCueMol()

    // Subscribe to log events.
    useCueMolEventListener({
        cm,
        enabled: cueMolReady,
        category: 'log',
        srcMask: event.SEM_ANY,
        evtMask: event.SEM_ANY,
        scopeId: event.SEM_ANY,
        handler: (args) => {
            const obj = (args as { obj?: { content?: string; newline?: boolean } } | null)?.obj
            let msg: string = obj?.content ?? ''
            if (obj?.newline) msg += '\n'
            console.log('log event called:', msg)
            callback(msg)
        },
    })

    // Drain any messages accumulated before this hook subscribed.
    useEffect(() => {
        if (!cueMolReady || !cm) return
        let cancelled = false
        ;(async () => {
            const res = await cm.invokeService('drainLogMessages', {})
            const accumMsg = res.msg
            if (!cancelled && accumMsg) callback(accumMsg)
        })()
        return () => { cancelled = true }
    }, [cueMolReady, cm])  // eslint-disable-line react-hooks/exhaustive-deps
}
