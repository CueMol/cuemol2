/**
 * Runs the generated helper for real in a temp dir. `open`, `pgrep` and
 * `pkill` are stubs on PATH: the stub `open` plays the new app, writing the
 * launch marker or not.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildSwapScript } from './swapScript'

function setup(newAppStarts: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'upd-swap-'))
  const app = path.join(root, 'Applications', 'CueMol3.app')
  const staging = path.join(root, 'work', 'staging', 'CueMol3.app')
  for (const [dir, v] of [[app, 'old'], [staging, 'new']] as const) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'version'), v)
  }
  const marker = path.join(root, 'work', 'launch-ok')
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`)
    chmodSync(path.join(bin, name), 0o755)
  }
  // The stub app records which version was launched; the new one may "start".
  stub('open', `v=$(cat "$1/version"); echo "$v" >> '${root}/launched'; ` +
    (newAppStarts ? `[ "$v" = new ] && touch '${marker}'` : 'true'))
  stub('pgrep', 'exit 0')
  stub('pkill', 'exit 0')
  const script = path.join(root, 'swap.sh')
  writeFileSync(script, buildSwapScript({
    parentPid: 999999, appPath: app, stagingPath: staging,
    backupPath: path.join(root, 'work', 'backup', 'CueMol3.app'),
    failedPath: path.join(root, 'work', 'failed', 'CueMol3.app'),
    markerPath: marker, resultPath: path.join(root, 'work', 'result.json'),
    pendingPath: path.join(root, 'work', 'pending.json'), logPath: path.join(root, 'work', 'swap.log'),
    from: '2.3.21.544', to: '2.3.22.550', exitTimeout: 2, launchTimeout: 1, processGrace: 1,
  }))
  const run = () => {
    try {
      execFileSync('/bin/sh', [script], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } })
    } catch { /* a rollback exits 1 */ }
  }
  const read = (p: string) => readFileSync(p, 'utf8').trim()
  return { root, app, run, read }
}

describe('swap helper', () => {
  it('keeps the new app and drops the backup once the new app reports it started', () => {
    const t = setup(true)
    t.run()
    expect(t.read(path.join(t.app, 'version'))).toBe('new')
    expect(existsSync(path.join(t.root, 'work', 'backup'))).toBe(true)
    expect(existsSync(path.join(t.root, 'work', 'backup', 'CueMol3.app'))).toBe(false)
    expect(JSON.parse(t.read(path.join(t.root, 'work', 'result.json'))).outcome).toBe('ok')
  })

  it('restores and relaunches the old app when the new one never reports', () => {
    const t = setup(false)
    t.run()
    expect(t.read(path.join(t.app, 'version'))).toBe('old')
    expect(JSON.parse(t.read(path.join(t.root, 'work', 'result.json'))).outcome).toBe('rolledBack')
    expect(t.read(path.join(t.root, 'launched')).split('\n')).toEqual(['new', 'old'])
  })
})
