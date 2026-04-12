// Worker is disabled until @cuemol/core native addon is built.
// All methods are stubs that return empty/zero values so the UI can run standalone.

class CueMolWorker {
  async loadCueMol(): Promise<void> {
    // stub
  }

  async createScene(): Promise<[number, number]> {
    return [0, 0]
  }

  async getSceneByView(_view_id: number): Promise<number> {
    return 0
  }

  async getSceneData(_scene_id: number): Promise<any[]> {
    // Return minimal stub data so SceneTree can render
    return [{ ID: 0, name: 'Scene 0' }]
  }

  async bindCanvas(_canvas: HTMLCanvasElement | null, _view_id: number, _dpr: number): Promise<any[]> {
    return []
  }

  async addView(_canvas_id: number | null, _view_id: number, _dpr: number | null = null): Promise<any[]> {
    return []
  }

  async activateView(_canvas_id: number | null, _view_id: number): Promise<any[]> {
    return []
  }

  async loadTestPDB(_scene_id: number, _view_id: number): Promise<any[]> {
    return []
  }

  resized(_view_id: number, _w: number, _h: number, _dpr: number): void {
    // stub
  }

  onMouseEvent(_view_id: number, _method: string, _event: MouseEvent): void {
    // stub
  }

  async addEventListener(
    _aCatStr: string,
    _aSrcType: number,
    _aEvtType: number,
    _aSrcID: number,
    _aObs: unknown
  ): Promise<number> {
    return 0
  }

  removeEventListener(_nID: number): void {
    // stub
  }

  async startLogger(): Promise<string> {
    return ''
  }

  async openPDBFile(_scene_id: number, _file_path: string): Promise<any[]> {
    return []
  }
}

export const cuemol_worker = new CueMolWorker()
