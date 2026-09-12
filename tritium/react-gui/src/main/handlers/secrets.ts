/**
 * @file main/handlers/secrets.ts
 * @description The credential channels.
 *
 * Thin: the store decides everything (see `main/secretStore.ts`). Main never
 * learns what a namespace means, exactly as it never sees the plugin registry
 * behind a contributed menu row.
 */

import { IPC } from '@shared/ipcChannels';
import { handleInvoke } from '../ipc/handleInvoke';
import { getSecret, secretStatus, setSecret } from '../secretStore';

/** Register the secret channels. */
export function registerSecretHandlers(): void {
  handleInvoke(IPC.SECRET_GET, (_e, ref) => getSecret(ref))
  handleInvoke(IPC.SECRET_SET, (_e, req) => setSecret(req))
  handleInvoke(IPC.SECRET_STATUS, (_e, ref) => secretStatus(ref))
}
