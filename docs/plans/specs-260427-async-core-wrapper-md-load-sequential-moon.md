# tritium/react-gui core 呼び出しの再設計 (worker-side service modules)

## Context

`specs/260427_async_core_wrapper.md` を受けて先行セッションで Promise pipelining
(commits 4e391917, face755a, d0a59b85, 3cffd79e, 4a66a54f) を実装したが、
以下の根本的限界が残っている。

- `loadObject()` から await を完全に除去できない。Command/Object/Renderer 等の
  polymorphic 基底クラスを返す method/getter は worker 側で実 subclass 名を
  解決する必要があり slow path round-trip が発生する。
- 数値や文字列を返す関数の戻り値を await せずに次のコマンドに渡すことが
  できない (future ObjProxy は object 限定)。
- ObjProxy が `{future: seqno}` を扱うため複雑化し、wrapper 層全体に伝播。
- mcwrapgen に polymorphic 検出ロジックが入っており保守コスト発生。

これらは pipelining アプローチの本質的な制約であり、改善の延長では解決しない。

代替方針として **重い path の実装そのものを worker 側に置く**。Renderer 側の
コードは「worker の特定 service を呼ぶ薄い proxy」だけになる。
worker 内では C++ API を直接同期呼び出しするため:

- await が一切不要 (数値・文字列の中間取得も自然に書ける)
- polymorphic 問題は普通の TypeScript `as` キャストで解決
- ObjProxy は ID のみの単純版に戻せる
- mcwrapgen の polymorphic 検出も削除可能

懸念: WorkerService.ts に command を直書きすると肥大化する。これを
**機能別ファイルへの分離 + 自動登録機構** で解消する。

## 全体方針

1. **Phase 1**: pipelining 関連 5 commits を revert し、動作確認 (ユーザー確認待ち)
2. **Phase 2**: worker-side service module 機構を新設 (機能別ファイル + 自動登録)
3. **Phase 3**: loadObject / loadScene / setupRenderer を worker 側 service に移行

## Phase 1: pipelining 関連 commit の revert

### Revert 対象 commits (新→古)

| Hash | 内容 | 扱い |
|------|------|------|
| 4a66a54f | perf timing, futureSlot eviction, pipeline tests | 全 revert (perf timing も削除) |
| 3cffd79e | mcwrapgen polymorphic slow path | revert |
| d0a59b85 | proxy future ObjProxy wrapper | revert |
| face755a | createWrapper accept ObjProxy synchronously | revert |
| 4e391917 | Promise pipelining 本体 | revert |

### Revert 後に到達するべき状態

- `tritium/react-gui/src/renderer/worker/ObjProxy.ts` は ID 文字列のみ保持の
  単純版 (future なし、`invokeMethodObj` / `invokeMethodVoid` / `getPropObj` /
  `setProp` の fast/void variant 全て削除、`postPipelined` も削除)
- `WorkerService.ts` から `_futureSlot` / `_evictFutureSlot` 系を削除
- mcwrapgen (`src/perl/TsClass.pm`) の `buildPolymorphicSet` / `isPolymorphic` を削除し、
  TS wrapper 生成は polymorphic 判定なしの単一 path に戻る
  → libcuemol2 を再ビルドして TS wrapper を再生成する必要あり
- BaseWrapper.ts の `invokeMethodObj` / `invokeMethodVoid` / `getPropObj` 削除
- `worker-pipeline.test.ts` 削除
- `asyncUtils.ts` (asAsync helper) は将来の参考に残しておくが、未使用化されれば削除

### Revert 手順

```bash
git switch -c tritium_260427_revert_pipelining
git revert --no-commit 4a66a54f 3cffd79e d0a59b85 face755a 4e391917
# conflict は手動解決
git commit -m "Revert pipelining-related commits"
# libcuemol2 再ビルド (TS wrapper 再生成のため)
cd build_scripts/ && task build_libcuemol2
# tritium 側ビルド
cd tritium && pnpm install && pnpm run build
```

### 動作確認 (Phase 2 着手前のチェックポイント)

- `cd tritium/react-gui && npm run dev` で起動
- PDB ファイル load → renderer 表示
- scene load
- view interaction (マウス操作)
- gtest: `cd build_scripts/ && task run_gtest` (libcuemol2 側のテストは無関係に通るはず)
- core jest: `cd tritium/core && npm run test`

→ **ここでユーザーに「想定通り動作している」確認を取る。OK 後 Phase 2 へ。**

## Phase 2: worker-side service module 機構

### 新規ディレクトリ構成

```
tritium/react-gui/src/renderer/worker/
├── WorkerService.ts              (既存。register API 追加)
├── worker_launcher.ts            (既存。auto-load ロジック追加)
├── services/                     (新設)
│   ├── index.ts                  (vite import.meta.glob で auto-load)
│   └── (Phase 3 で各 service を追加)
└── types/
    └── WorkerContext.ts          (新設)
```

### `WorkerContext` interface (新規)

`tritium/react-gui/src/renderer/worker/types/WorkerContext.ts`:

```typescript
import type { WorkerService } from '../WorkerService';
import type { SceneManager, CmdMgr, StreamManager, StyleManager } from '@cuemol/core';

export interface WorkerContext {
    svc: WorkerService;       // objSlot / postEvent / cuemol facade access
    sceMgr: SceneManager;
    cmdMgr: CmdMgr;
    strMgr: StreamManager;
    styleMgr: StyleManager;
    // 必要な xxxMgr が増えたら追加
}
```

`svc` 経由で `objSlot` / `postEvent` / `cuemol` facade にアクセスできるため、
context には xxxMgr のみ含める (ユーザー指示)。

### `WorkerService` への追加 API

```typescript
// 既存のハードコード dispatch table はそのまま残す (既存 command は移行しない)
// 新たに動的 register() を追加し、services/ から登録された command も解決する

// 戻り値型は最初から Promise も許容する (将来の async service / yield 対応のため)
type ServiceFn = (ctx: WorkerContext, args: any) => any | Promise<any>;

private _registered: { [name: string]: ServiceFn } = {};

register(name: string, fn: ServiceFn): void {
    if (name in this._registered) {
        log.warn(`WorkerService.register: overwriting "${name}"`);
    }
    this._registered[name] = fn;
}

private _buildContext(): WorkerContext {
    return {
        svc: this,
        sceMgr: this._sceMgr,
        cmdMgr: this._cmdMgr,
        // ...
    };
}

// invoke() 内: ハードコード method 解決の後、_registered にもフォールバック
invoke(method: string, seqno: number, args: any[]): void {
    if (method in this._methods) {
        // 既存 path
    } else if (method in this._registered) {
        // Promise.resolve で sync/async 両対応
        Promise.resolve()
            .then(() => this._registered[method](this._buildContext(), args[0]))
            .then((result) => this._postMessage([method, seqno, true, result]))
            .catch((e) => this._postMessage([method, seqno, false, String(e)]));
    } else {
        // unknown
    }
}
```

xxxMgr lookup のキャッシュは WorkerService.initCueMol() で 1 回だけ取得し
private field に保持する形が無難。

### Service 自動登録 (Vite `import.meta.glob`)

`services/index.ts`:
```typescript
import type { WorkerService } from '../WorkerService';

const modules = import.meta.glob('./*.service.ts', { eager: true }) as Record<
    string,
    { name: string; default: (ctx: any, args: any) => any }
>;

export function registerAllServices(svc: WorkerService): void {
    for (const path of Object.keys(modules).sort()) {
        const m = modules[path];
        if (!m.name || typeof m.default !== 'function') {
            console.warn(`services: skipping ${path} (missing name or default export)`);
            continue;
        }
        svc.register(m.name, m.default);
    }
}
```

`worker_launcher.ts` 末尾に 1 行追加:
```typescript
import { registerAllServices } from './services';
// ... existing code ...
registerAllServices(svc);
```

ファイル名規約 `*.service.ts` で fugitive ファイル混入を防ぐ。各 service は
`name` (string) と `default` (関数) を export する。table の手書きは不要。

### Service 関数の規約

```typescript
// services/example.service.ts
import type { WorkerContext } from '../types/WorkerContext';

export const name = 'example';
export default function example(ctx: WorkerContext, args: { foo: string }): any {
    // ctx.sceMgr, ctx.cmdMgr など同期呼び出し
    // C++ object handle を Renderer に返したい時は ctx.svc.registerObj(obj) で
    // ObjTuple を返す (現状の objSlot 仕組みを踏襲)
    return { ok: true };
}
```

## Phase 3: loadObject / loadScene / setupRenderer の移行

### 新規 service ファイル

```
services/
├── loadObject.service.ts
├── loadScene.service.ts
├── setupRenderer.service.ts     (内部 helper として export、loadObject から呼ぶ)
└── helpers/
    ├── makeSel.ts               (純関数。WorkerContext を受け取る)
    ├── makeColor.ts
    ├── molPostProc.ts
    └── getDefaultStyleName.ts
```

helpers/ は service 関数ではなく副作用のない純関数。
`name` / `default` を持たず glob から除外される (ファイル名は `.service.ts`
ではない、または別ディレクトリ)。複数 service から再利用される。

### loadObject service の実装イメージ

`services/loadObject.service.ts`:
```typescript
import type { WorkerContext } from '../types/WorkerContext';
import { setupRenderer } from './setupRenderer.service';
import type { LoadObjectCommand, MolCoord } from '@cuemol/core';
import type { FileOpenOptions } from '../../types';

export const name = 'loadObject';

export interface LoadObjectArgs {
    filePath: string;
    sceneId: number;
    options: FileOpenOptions;
}

export default function loadObject(ctx: WorkerContext, args: LoadObjectArgs): any {
    const scene = ctx.sceMgr.getScene(args.sceneId);
    const cmd = ctx.cmdMgr.getCmd('load_object') as LoadObjectCommand;
    cmd.target_scene = scene;
    cmd.file_path = args.filePath;
    cmd.run();
    const mol = cmd.result_object as MolCoord;
    if (args.options.renderer.objectName) {
        mol.name = args.options.renderer.objectName;
    }
    setupRenderer(ctx, { mol, rendOpts: args.options.renderer });
    // C++ object handle を Renderer に返却 (必要なら)
    return { molHandle: ctx.svc.registerObj(mol) };
}
```

### Renderer 側 (AsyncCueMol.ts)

`loadObject` / `loadScene` / `setupRenderer` を以下のように単純化:

```typescript
async loadObject(filePath: string, scene_id: number,
                 options: FileOpenOptions): Promise<boolean> {
    log.info(`loading object file: ${filePath}`);
    const result = await this.invokeWorker('loadObject', {
        filePath, sceneId: scene_id, options,
    });
    return result?.ok ?? true;
}
```

`makeSel` / `makeColor` / `molPostProc` は AsyncCueMol から削除し、
worker helpers/ に移植。AsyncCueMol 側で旧 method を呼んでいる箇所は
全て worker service 経由に置き換える。

## 改修ファイル一覧

### Phase 1 (revert)
- `tritium/react-gui/src/renderer/worker/AsyncCueMol.ts` (revert)
- `tritium/react-gui/src/renderer/worker/ObjProxy.ts` (revert: 単純版に)
- `tritium/react-gui/src/renderer/worker/ObjTuple.ts` (revert)
- `tritium/react-gui/src/renderer/worker/WorkerService.ts` (revert)
- `tritium/react-gui/src/renderer/worker/asyncUtils.ts` (revert / 削除)
- `tritium/react-gui/src/renderer/__test__/worker-pipeline.test.ts` (削除)
- `tritium/core/src/BaseWrapper.ts` (revert)
- `tritium/core/src/wrappers/*.ts` (libcuemol2 再ビルドで再生成)
- `src/perl/TsClass.pm` (revert: polymorphic 検出を削除)

### Phase 2 (新設)
- `tritium/react-gui/src/renderer/worker/types/WorkerContext.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/index.ts` (新規)
- `tritium/react-gui/src/renderer/worker/WorkerService.ts` (register / invoke 拡張)
- `tritium/react-gui/src/renderer/worker/worker_launcher.ts` (registerAllServices 呼び出し)

### Phase 3 (移行)
- `tritium/react-gui/src/renderer/worker/services/loadObject.service.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/loadScene.service.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/setupRenderer.service.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/helpers/makeSel.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/helpers/makeColor.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/helpers/molPostProc.ts` (新規)
- `tritium/react-gui/src/renderer/worker/services/helpers/getDefaultStyleName.ts` (新規)
- `tritium/react-gui/src/renderer/worker/AsyncCueMol.ts` (loadObject/loadScene/setupRenderer を proxy 化)

## 検証手順

### Phase 1 後 (ユーザー確認待ちポイント)
1. `cd build_scripts/ && task build_libcuemol2` で libcuemol2 再ビルド
2. `cd tritium && pnpm install && pnpm run build`
3. `cd tritium/core && npm run test` (既存の core テスト全通過)
4. `cd tritium/react-gui && npm run dev` 起動
5. PDB load + scene save/load + view interaction が pipelining 導入前の挙動と
   一致することを目視確認
6. **ユーザーに動作確認を求める**

### Phase 2 後
1. `cd tritium && pnpm run build` (型エラーなし)
2. WorkerService の既存 method (createObj, getService 等) の dispatch が壊れていないこと

### Phase 3 後
1. `cd tritium/react-gui && npm run dev` 起動
2. PDB load → renderer 表示まで Renderer-Worker 間 round-trip が **2 回**
   (`loadObject` 1 回 + Renderer 側で必要な後処理があれば追加) で完了することを
   `[perf]` ログで確認
3. selection / coloring を含む load opts でも正しく描画される
4. polymorphic 系 (Object / Renderer / Command 派生) の取り違えがないこと
5. multi load (複数 PDB を順に load) でも race / state corruption なし

## 将来課題 (本 spec の範囲外)

- C++ 側からの進捗通知 → Renderer の progress bar / cancel
- worker side service の中で長時間処理を分割実行 (chunk + yield) する仕組み
- service 関数の型安全な呼び出し (Renderer 側で `invokeWorker` の引数/戻り値型を
  service の型から自動導出する高度な型ヘルパー)
