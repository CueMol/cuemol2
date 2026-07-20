# PR 1: AnimMgr のアニメ前プロパティ保存/復元

- 対象: libcuemol2 (`src/qsys/anim/`, `src/modules/anim/`)
- 関連: [ADR-0040](../migration/adr/ADR-0040-animation-rendering.md) decision (3)
- 位置づけ: movie rendering 移植 (PR 2) の前提。単独でマージ可能で、uxp_gui にも即座に効く

## 1. 目的

`AnimMgr` はアニメ再生中にシーンの renderer/object プロパティを破壊的に書き換えるが、
その書き込みは undo transaction の外で行われる (`startImpl` / `onTimerImpl` /
`writeFrame` のどこにも `startUndoTxn` が無い)。結果として:

- play すると undo スタックに記録の無いシーン変更が起きる → 後で undo するとシーンと
  undo 履歴が食い違う
- 再生後・レンダリング後にシーンが最終フレームの状態のまま残る

アニメが書き換えるプロパティを再生開始時に退避し、完全停止時に書き戻すことで解消する。

## 2. スコープ

**含む**: `AnimMgr` の退避/復元、`PropAnim` への hook 追加、5 つの `PropAnim` サブクラスへの実装、gtest

**含まない**: tritium 側の変更 (PR 2)、scene duplication、rendering 中の target scene ロック、
再生中のユーザー編集の制御 (いずれも ADR-0040 で不採用/先送りと決定済み)

## 3. 現状の把握 (実装確認済み)

### 状態遷移と退避/復元の要否

| 呼び出し | 現在の実装 | 退避 | 復元 |
|---|---|---|---|
| `start()` AM_STOP から (`AnimMgr.cpp:150-157`) | `startImpl()` → タイマ設定 | **する** | -- |
| `start()` AM_PAUSED から (`:158-164`) | タイマ再設定のみ。`startImpl()` は呼ばれない | しない | -- |
| `stop()` (`:167-175`) | タイマ解除・時刻リセット・AM_STOP | -- | **する** |
| `pause()` (`:177-193`) | AM_PAUSED へ。ただし `m_timeRemain==0` なら **AM_STOP に落ちる** (`:187-190`) | -- | **しない** |
| `goTime()` (`:201-237`) | `stop()` → `startImpl()` → イベント適用 → `pause()` | (stop/startImpl 経由) | (stop 経由) |
| `onTimer(bLast=true)` (`:293-303`) | **`stop()` を呼ばず inline で AM_STOP に**。`m_loop` なら `start()` 再呼び出し | -- | **する** (loop 時を除く) |
| `setupRender()` (`:539-561`) | `startImpl()` のみ | (startImpl 経由) | -- |
| `clear()` (`:321-329`) | `stop()` 経由 | -- | (stop 経由) |
| `sceneChanged()` VIEW_REMOVING (`:307-319`) | `stop()` 経由 | -- | (stop 経由) |

**特に注意を要する 3 点** (いずれも素朴な実装では踏む):

1. **自然終了は `stop()` を通らない**。`onTimer(bLast=true)` が inline で状態をリセットする。
   「Play を押して最後まで再生」という最頻経路がここ。復元をここにも入れないと漏れる。
2. **ループ再生では `start()` → `startImpl()` が周回ごとに走る**。退避を無条件に行うと
   2 周目で「1 周目終了時の状態」を退避してしまい、元の値が失われる。
3. **`goTime()` は末尾で `pause()` を呼び、終端までシークすると `pause()` が AM_STOP に落ちる**。
   「AM_STOP になったら復元」という条件で書くと、終端へのシークが元の値に戻ってしまう。
   復元は **明示的な `stop()` 呼び出し**に紐づける。

### PropAnim 階層と実際に書き換える対象

```
PropAnim (abstract, qsys/anim/PropAnim.hpp)
├── MolAnim                 → Object   : getPropName() 1 つ (prop で可変)
└── RendPropAnim (abstract) → Renderer
    ├── RealPropAnim        → getPropName() 1 つ
    ├── ShowHideAnim        → visible + alpha        ★ getPropName() は "visible" のみ
    └── RendXformAnim       → xformMat               ★ setXformMatrix() 直呼び
        └── SlideInOutAnim  → xformMat (super) + visible
```

**`getPropName()` は「実際に書き換えるプロパティの集合」ではない。**
`ShowHideAnim::onPropInit` (`ShowHideAnim.cpp:48-58`) は `visible` に加えて `alpha` を書き、
`RendXformAnim::onPropInit` (`RendXformAnim.cpp:40`) は `setXformMatrix()` を直接呼ぶ。
したがって `startImpl` の `prop_tl` (`AnimMgr.cpp:97-126`) は **ターゲット `(uid, PropAnim)` の
列挙元としては使えるが、退避すべきプロパティ名の列挙元にはならない**。

## 4. 設計

### 4.1 退避ストアは AnimMgr が持つ

```cpp
// AnimMgr.hpp (private)
typedef std::map<LString, qlib::LVariant> propsave_t;  // key = "<uid>:<propname>"
propsave_t m_propSave;
bool m_bLoopLap;   // ループ周回中のみ true (下記参照)
```

`m_bLoopLap` は「ループ再生が次の周回を始めるところ」でだけ true にする。当初は
「退避済みか」を表す `m_bPropSaved` にしていたが、それだと `stop()` を経ずに再生が
中断された場合 (レンダ中にダイアログを閉じる、異常終了) にフラグが true のまま残り、
**次回の再生で退避がスキップされる**穴があった。「周回中か」で持てば、それ以外の
`startImpl()` は必ず現在のシーン状態から取り直すので穴が塞がる。

key の書式は既存 `prop_tl` の `LString::format("%d:%s", int(uid), propnm)`
(`AnimMgr.cpp:117`) をそのまま流用し、分解ロジックも既存 (`:131-135`) に合わせる。

### 4.2 「何を退避するか」はサブクラスが宣言する

```cpp
// PropAnim.hpp
virtual void onPropSave(AnimMgr *pMgr, qlib::uid_t tgt_uid) = 0;
```

純粋仮想にして、新規サブクラス追加時にコンパイルエラーで実装を強制する。
サブクラスは「どの `(uid, propname)` を保存すべきか」を申告するだけで、
現在値の読み出しは `AnimMgr` 側のヘルパが行う:

```cpp
// AnimMgr.hpp (public, サブクラスから呼ぶ)
void savePropVal(qlib::uid_t uid, const LString &propnm);
```

実装は各サブクラス数行:

| サブクラス | `onPropSave` の中身 |
|---|---|
| `RealPropAnim` | `pMgr->savePropVal(uid, getPropName())` |
| `MolAnim` | 同上 |
| `ShowHideAnim` | `visible` と `alpha` の 2 回 |
| `RendXformAnim` | `xformMat` |
| `SlideInOutAnim` | `super_t::onPropSave()` (= `xformMat`) + `visible` |

### 4.3 復元は AnimMgr に一元化

```cpp
// AnimMgr.hpp (private)
void restoreProps();
```

`m_propSave` を走査し、key を uid / propname に分解、
`SceneManager::getRendererS(uid)` → null なら `getObjectS(uid)` の順で解決し
`setProperty(propnm, val)`。**解決できなければ黙って skip** する
(レンダリング中に renderer が削除された、シーンが clear された等)。
最後に `m_propSave.clear()` と `m_bPropSaved = false`。

`getRendererS` / `getObjectS` はどちらも `SceneManager` の static
(`SceneManager.hpp:92-95`) で、uid はグローバルに一意なので順に試して良い。

### 4.4 組み込み位置

**退避** — `startImpl()` の `onPropInit` 呼び出しループ (`AnimMgr.cpp:130-144`) 内、
`onPropInit()` の**直前**:

```cpp
if (!m_bLoopLap)
  pPropAnim->onPropSave(this, uid);
pPropAnim->onPropInit(this, uid);
```

ループに入る前に、`m_bLoopLap` が false なら `m_propSave.clear()` する
(中断された再生の残骸を捨てる)。

**復元** — 2 箇所:

- `stop()` (`:167-175`) の先頭で `restoreProps()`
- `onTimer()` の `bLast` 分岐 (`:293-303`)、**`m_loop` が false のときのみ**
  (`m_loop` が true なら `start()` で周回が続くので退避を保持したまま継続)

`pause()` には**入れない**。

### 4.5 rendering 経路

`setupRender()` は `startImpl()` を通るので退避される。復元は呼び出し側が
`stop()` を呼ぶことで起きる。**`stop()` を呼ぶのは呼び出し側の責務**とし、
`AnimMgr` 側に `finishRender()` のような対の API は足さない (既存 `stop()` で足りる)。
UXP の `anim-render-dlg.js` は `stop()` を呼んでいないため、そのままでは復元されない。
PR 2 (tritium) では完了時・中断時の双方で必ず `stop()` を呼ぶ。

> 本 PR で uxp_gui 側にも入れた。`anim-render-dlg.js` の 3 箇所
> (`onStop` / `finRenderTasks` / `onTimer` の catch) で `mAnimMgr.stop()` を呼ぶ。
> `onTimerReenc` の catch は同じ後始末をするが AnimMgr を使わない (PNG 連番からの
> 再エンコードのみ) ので対象外。

## 5. 事前確認の結果 (2026-07-20 実施・全項目クリア)

| # | 確認事項 | 結果 |
|---|---|---|
| 1 | `RendXformAnim` の xform matrix はプロパティか | **YES**。`Renderer.qif:56` に `property object<Matrix> xformMat => redirect(getXformMatrix, setXformMatrix)`。プロパティ名は `xformMatrix` ではなく **`xformMat`**。§4.2 の汎用設計にそのまま乗る |
| 2 | `setVisible()` ヘルパの中身 | `RendPropAnim::setVisible` (`RendPropAnim.cpp:120-127`)。`getPropBool("visible")` で読んで差分があれば `setPropBool("visible", v)` するだけ。**子孫は辿らない**ので、復元も `visible` を戻すだけでよい |
| 3 | `SlideInOutAnim` の継承元と書き込み内容 | **`RendXformAnim` の子**だった (`SlideInOutAnim.hpp:15`)。`super_t::onPropInit()` (= `setXformMatrix`) に加えて `setVisible()` を呼ぶ (`SlideInOutAnim.cpp:53-74`)。したがって `xformMat` + `visible` の 2 つ |
| 4 | `MolAnim::getPropName()` の実プロパティ名 | 固定名ではなく **`prop` プロパティで可変** (`MolAnim.qif:24`, `MolAnim.hpp:37,64`)。`getPropName()` をそのまま使えばよい |
| 5 | `AnimMgr::stop()` の `.qif` 露出 | **露出済み** (`AnimMgr.qif` の `void stop();`)。`setupRender` / `writeFrame` / `frameno` / `startcam` も同様に露出済みで、PR 2 から worker 経由で呼べる |
| 6 | `LVariant` を `std::map` に保持する安全性 | **安全**。`LVariant::copyFrom` (`qlib/LVariant.cpp`) は deep copy で、`LT_STRING` は `MB_NEW LString(...)`、`LT_OBJECT` は `pObjValue->copy()` を行い所有する |

### 6 に付随していた残リスク → 解消 (2026-07-20)

`xformMat` は `LT_OBJECT` なので `LVariant` のコピーが内部で `Matrix::copy()` を呼ぶ。
`Matrix` が copy 不可なら `RendXformAnim` だけ特殊扱いが必要になるところだったが、
`RestoresObjectValuedProperty` テストで **object 値プロパティの保存/復元が通ることを実機で確認**した。
汎用経路のままでよく、特殊扱いは不要。

## 6. テスト計画 (gtest)

`src/tests/qsys/` に `test_animmgr.cpp` を追加 (`src/tests/CMakeLists.txt` に登録)。
`SetUp()` で `qsys::init(<topdir>/data/sysconfig.xml)`。

まず既存 `src/tests/qsys/` の構成 (シーン・オブジェクト・レンダラを作るヘルパの有無) を
確認し、無ければ最小のフィクスチャを用意する。

**CLAUDE.md の方針どおり、実装前にテストを書いて red にしてから実装する。**

実装したケース (`AnimMgrRestoreTest`, 9 件・全 green):

| テスト | 検証する仕様 |
|---|---|
| `StopRestoresOriginalValue` | 明示的な `stop()` で元の値に戻る |
| `NaturalEndRestoresOriginalValue` | `onTimer(bLast)` の自然終了でも戻る (`stop()` を通らない経路) |
| `PauseKeepsAnimatedValue` | `pause()` はアニメ途中の値を保持する |
| `SeekToEndKeepsAnimatedValue` | 終端シークで戻らない (`goTime` 末尾の `pause()` が AM_STOP に落ちる罠を pin)。その後の `stop()` では戻る |
| `LoopDoesNotOverwriteSavedValue` | loop 2 周でも退避は 1 回だけ、`stop()` で 1 周目開始前の値に戻る |
| `RestoresPropertiesBeyondGetPropName` | `getPropName()` に現れないプロパティ (`visible`) も復元される |
| `RestoresObjectValuedProperty` | `xformMat` (`LT_OBJECT`) の保存/復元が通る (§5 の残リスク検証) |
| `DeletedTargetIsSkipped` | 再生中に対象 renderer が消えても例外なく skip |
| `AbandonedPlaybackDoesNotLeaveStaleSave` | `stop()` を経ずに中断された再生が次回の退避を壊さない (§4.1 の穴を pin) |
| `SetupRenderThenStopRestores` | オフラインレンダ経路 (`setupRender` → `stop`) でも復元される |

テスト自体の有効性は 2 通りで確認済み。`savePropVal()` を一時的に no-op にすると
9 件が red になる (`PauseKeepsAnimatedValue` のみ green のままで、これは復元機能に
依存しないテストなので正しい)。`m_propSave.clear()` を無効化すると
`AbandonedPlaybackDoesNotLeaveStaleSave` だけが red になる。

実サブクラス (`ShowHideAnim` / `RendXformAnim` など) は `modules/anim` にあり
`test_qsys` からリンクされていないため、テストは `PropAnim` を継承したテスト専用クラスで
`AnimMgr` 側のロジックを検証している。各サブクラスの `onPropSave` の申告漏れは
§7-7 の手動確認でカバーする。

## 7. 実装手順

1. `src/tests/qsys/test_animmgr.cpp` を追加し、§6 のケースを書いて red を確認
2. `PropAnim.hpp` に `onPropSave()` 純粋仮想を追加
3. `AnimMgr` に `m_propSave` / `m_bPropSaved` / `savePropVal()` / `restoreProps()` を追加
4. 5 サブクラスに `onPropSave()` を実装。**`RendXformAnim` を実装した時点で
   §5 の残リスク (`Matrix` の `copy()`) を 1 ケース動かして確認する**
5. `startImpl()` / `stop()` / `onTimer()` に組み込み、テストを green に
6. `cd build_scripts && task run_gtest`
7. uxp_gui で手動確認: play → 最後まで再生 / play → pause / play → stop /
   goTime でのシーク / animation rendering の完走と中断

## 8. 影響範囲とリスク

**コード変更**: `src/qsys/anim/{PropAnim.hpp, AnimMgr.hpp, AnimMgr.cpp}`、
`src/modules/anim/{RealPropAnim, ShowHideAnim, SlideInOutAnim, RendXformAnim, MolAnim}.{hpp,cpp}`、
`src/tests/`

**挙動変更 (コード変更不要な側)**:
- uxp_gui: Stop / 自然終了でシーンが再生前の状態に戻るようになる
- tritium: `AnimTransport` の Stop も同様。ツールチップへの明記は PR 2 で行う

**リスク**:
- 既存ユーザーにとっては Stop の意味が変わる。ADR-0040 で意図的な変更として記録済み
- `onPropSave` の実装漏れ → 純粋仮想でコンパイル時に強制するため、既存 5 クラスについては
  漏れない。ただし「宣言した内容が `onPropInit`/`onStart`/`onEnd` の実際の書き込みと
  一致しているか」は人力監査に依存する (§5-1〜4)
- 復元は undo transaction 外で行う。復元自体を undo 可能にはしない (アニメ再生は
  undo 対象の編集操作ではない、という整理)
