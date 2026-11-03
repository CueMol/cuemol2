/**
 * @file main/localApi/editLock.ts
 * @description The edit lock: one local API client at a time may edit.
 *
 * Every client shares the app's active scene, and the worker's own guard
 * (`txnBusy()`) covers one submission only. A command line that opens
 * `a.qsc` and then loads `a.pdb` sends two runs; without this, another client
 * could open its own scene between them and `a.pdb` would land there. The
 * lock spans the whole command line instead, and a client that runs into it
 * is turned away at once (no queue, no retry).
 *
 * - A client holds it explicitly (`/console/lock` acquire ... release) with
 *   an owner id, which its runs carry; or a request takes it implicitly for
 *   its own duration (a lone `/console/run`, an MCP `tools/call`).
 * - It lapses `EDIT_LOCK_IDLE_MS` after its last request ended, so a client
 *   that died without releasing it does not keep it. A request in flight
 *   keeps it however long it runs.
 * - The GUI (console panel, agent) does not take part.
 *
 * Free of Electron and the clock (both injected), so it is tested directly.
 */

/** How long a held lock with nothing in flight survives its holder's silence. */
export const EDIT_LOCK_IDLE_MS = 10_000

interface Held {
  owner: string
  /** Taken for one request only: dropped when that request ends. */
  implicit: boolean
  inFlight: number
  /** When `inFlight` last fell to 0. */
  idleSince: number
}

export class EditLock {
  private held: Held | null = null
  private anon = 0

  constructor(private readonly now: () => number = Date.now) {}

  /** The lock as it stands, a lapsed one dropped. */
  private current(): Held | null {
    const h = this.held
    if (h && h.inFlight === 0 && this.now() - h.idleSince >= EDIT_LOCK_IDLE_MS) this.held = null
    return this.held
  }

  /** Hold the lock for `owner`; false when another owner holds it. */
  acquire(owner: string): boolean {
    const h = this.current()
    if (h && h.owner !== owner) return false
    if (!h) this.held = { owner, implicit: false, inFlight: 0, idleSince: this.now() }
    else h.implicit = false
    return true
  }

  /** Let go of the lock, if `owner` holds it. */
  release(owner: string): void {
    if (this.current()?.owner === owner) this.held = null
  }

  /**
   * Start one request under `owner`, or under a lock of its own when no
   * owner is given.
   *
   * @returns the function that ends the request, or null when another owner
   *   holds the lock (the request must not run)
   */
  enter(owner?: string): (() => void) | null {
    const h = this.current()
    if (h && (owner === undefined || h.owner !== owner)) return null
    let held = h
    if (!held) {
      held = { owner: owner ?? `anon-${++this.anon}`, implicit: owner === undefined, inFlight: 0, idleSince: 0 }
      this.held = held
    }
    held.inFlight++
    const mine = held
    let ended = false
    return () => {
      if (ended) return
      ended = true
      mine.inFlight--
      if (this.held !== mine) return
      if (mine.implicit && mine.inFlight === 0) this.held = null
      else if (mine.inFlight === 0) mine.idleSince = this.now()
    }
  }
}
