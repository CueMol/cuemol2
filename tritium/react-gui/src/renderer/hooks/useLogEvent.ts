import { useEffect } from 'react'
import * as event from '../event'
// import { cuemol_worker } from '../cuemol_worker'
import { useCueMol } from './useCueMol'

export function useLogEvent(callback: (msg: string) => void): void {
    const { cueMolReady, cm } = useCueMol()

    useEffect(() => {
        if (!cueMolReady || !cm) return () => { };

        // TODO: restore when cuemol_worker is re-enabled
        let cbid: number;
        (async () => {
            cbid = await cm.addEventListener(
                'log',
                event.SEM_ANY,
                event.SEM_ANY,
                event.SEM_ANY,
                (args: any) => {
                    let msg: string = args.obj?.content ?? ''
                    if (args.obj?.newline) msg += '\n'
                    console.log('log event called:', msg)
                    callback(msg)
                }
            )
            console.log('add cuemol event listener cbid=', cbid)
            // const accumMsg = await cm.startLogger()
            const logMgr = await cm.getService('MsgLog') as any;
            const accumMsg = await logMgr.getAccumMsg();
            logMgr.removeAccumMsg();
            if (accumMsg) callback(accumMsg)
        })();

        return () => {
            if (cbid !== undefined) {
                cm.removeEventListener(cbid)
            }
        }
    }, [cueMolReady])
}
