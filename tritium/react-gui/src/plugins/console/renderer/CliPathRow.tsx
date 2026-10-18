/**
 * @file plugins/console/renderer/CliPathRow.tsx
 * @description The "Command line tool" row on the console's Settings page:
 * where tritium_cli is, to copy, and how to put it on PATH.
 *
 * The installers leave PATH alone (except the .deb, which links
 * /usr/bin/tritium_cli), so this row is how a user finds the command.
 */

import React, { useEffect, useState } from 'react'
import { FormButton, TextField } from '@renderer/h3-kit/form'
import { IPC } from '@shared/ipcChannels'

/** One line on putting `cliPath` on PATH, by what kind of path it is. */
function pathHint(cliPath: string): string {
  if (cliPath === '') return 'Not available in the AppImage; install the .deb package to use tritium_cli.'
  if (cliPath.endsWith('.mjs')) return `Development build: run it with node "${cliPath}".`
  if (cliPath.endsWith('.cmd')) {
    const dir = cliPath.slice(0, cliPath.lastIndexOf('\\'))
    return `Add ${dir} to PATH to run it as tritium_cli.`
  }
  return `Link it into a directory on PATH to run it as tritium_cli: ln -s "${cliPath}" ~/.local/bin/tritium_cli`
}

export const CliPathRow: React.FC = () => {
  const [cliPath, setCliPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void window.electronAPI?.invoke(IPC.APP_PATH).then((info) => {
      if (live && info) setCliPath(info.cliPath)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  if (cliPath === null) return null
  return (
    <div className="console-cli-row">
      {cliPath !== '' && (
        <div className="config-setting-path-row">
          <TextField value={cliPath} onChange={() => {}} readOnly mono />
          <FormButton
            text={copied ? 'Copied' : 'Copy'}
            onClick={() => {
              void navigator.clipboard?.writeText(cliPath)
              setCopied(true)
            }}
          />
        </div>
      )}
      <span className="type-caption">{pathHint(cliPath)}</span>
    </div>
  )
}
