# Hover highlight の消去タイミング見直し (tritium/react-gui)

状態: **実装済み** (`fix/hover-highlight-retention`)

## Context

いまは 3D view 上でボタン (左・中) を押した瞬間に hover が消える。ラベルチップも C++ 側の hover highlight も同時に消える。そのため、クリックで pick label を出しただけでも highlight が消えてしまう。

希望する挙動は「view の回転・並進が起きない限り、hover highlight をできるだけ残す」。マウスを動かせば、これまでどおり再サンプルして更新・消去する。

調査で分かったこと:
- 消去しているのは renderer 側だけ。`useHoverInfoHandler.ts` の `onMouseDown` が、右ボタン以外では `clear()` を呼び、`naviHoverClear` を送っている。もう 1 か所、`onMouseMove` でもボタンを押したまま動かすと `clear()` する。
- C++ (`src/qsys/GUIView.cpp` の `setHoverHit` / `clearHoverHit`) は、明示的に clear されない限り highlight を保つ。pick buffer が更新されると (クリックで label renderer が増えた場合など) mask は `m_pickSerial` から作り直される。そのため C++ 側の変更は要らない。
- C++ がクリックとドラッグを分けるしきい値は `src/qsys/MouseEventHandler.cpp` の `move()` にある。押下点から |dx|<2 かつ |dy|<2 ならドラッグとみなさない (クリック扱い)。
- 範囲 (ユーザー確認済み): 対象はマウス操作だけ。ホイールでのズームや、マウス以外での view 変更 (Camera pane など) は現状のままにする。

## 方針

`tritium/react-gui/src/renderer/features/molview/useHoverInfoHandler.ts` の中だけで直す。

1. **押下では消さない (全ボタン共通)**
   - `onMouseDown` は `clear()` を呼ばない。代わりに押下位置 `pressAt` (clientX/Y) を記録する。
   - 未発行の `pending` と `timer` だけは捨てて、押下中は新しいサンプルを出さないようにする。
   - 送信中のリクエストは無効化しない。返ってきた返答 (ほぼ押下位置の hit) はそのまま反映する。
     - 理由: guard で捨てると、worker 側では highlight が付いているのに `highlighted` フラグが false のままになり、あとで clear が送られず highlight が残るおそれがある。
   - いま右ボタンだけ特別扱いしている `if (e.button === 2) return;` は不要になる。右押下も同じ規則に入る。
2. **押下したまま動いた場合**
   - `e.buttons !== 0` で、`pressAt` から C++ と同じしきい値 (|dx|>=2 または |dy|>=2) を超えたら、ドラッグ (回転・並進) とみなして `clear()` する。
   - しきい値内なら何もしない。`lastPos` の記録は続ける。
   - `pressAt` が無いまま押下状態の move が来た場合 (canvas の外で押してから入ってきた場合など) は、従来どおり `clear()` する。
   - しきい値は `CLICK_SLOP_PX = 2` のような定数として export し、コメントで `MouseEventHandler::move` との対応を書く。
3. **ボタンを離した後**
   - mouseup 用の listener は追加しない。`e.buttons === 0` の move が来た時点で `pressAt = null` に戻す。
   - クリックだけでマウスが動いていなければ、何も送らない。highlight もチップもそのまま残る。
   - 次に 1px でも動けば、既存の経路で再サンプルする。同じ原子なら C++ の `setHoverHit` と `apply` の key 比較で no-op になる。
4. **context menu の hold と release 時の resync (`hoverHold.ts`) は変えない。**
5. ファイル先頭の `@description` コメントを新しい規則に書き換える (英語、ASCII のみ)。「押下では hover を終えない。2px を超えるドラッグで終える」。

ラベルチップ (`MolViewHoverLabel`) と C++ highlight は同じ hit から作っているので、両方とも一緒に残す。

## テスト (`tritium/react-gui/src/renderer/__test__/useHoverInfoHandler.test.tsx`)

規則が変わるので、既存テストを追随させ、仕様を 1 件で押さえる。新しいファイルは作らない。
- 2 件目の末尾にある「A left press still ends the hover」を差し替える。新しい内容は「左押下では `naviHoverClear` も `setter(null)` も起きない → 押下したまま 1px 動いても消えない → 2px 動くと `naviHoverClear` が 1 回送られ `setter(null)` になる」。
- 1 件目の「ボタンを押したまま動くと消える」(押下イベントなし) は、`pressAt` が無い経路としてそのまま残す。

## 検証 (CLAUDE.md の検証チェーンに従う)

1. `cd build_scripts && task build_tritium`
2. `task run_tritium` で起動し、`shader program created OK` まで進むことを確認する。
3. ユーザーに目視で確認してもらう。
   - 原子の上でクリック → label が出ても highlight とチップが残る。
   - 1px 程度の手ぶれでは残る。
   - 回転・並進のドラッグで消える。
   - 離した後にマウスを動かすと再サンプルされる。
   - 右クリックの context menu の挙動が従来どおり。
4. 挙動が確定したら、`cd tritium/react-gui && npm test` でテストを追随させる。そのあと `npx tsc -p tsconfig.web.json --noEmit`。
