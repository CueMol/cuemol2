# undo / redo / rollback が失敗したとき

undo の 1 step (`UndoManager` の 1 transaction) は、複数の `EditInfo` の `undo()` / `redo()` を順に実行する。
そのどれかが `false` を返すか例外を投げたときの扱いを書く。

実装:
- C++: `src/qsys/UndoManager.{hpp,cpp}` (`runStep`、`dropHistory`、`takeHistoryDropped`)、
  `src/qsys/Scene.cpp` (`undo` / `redo` / `rollbackUndoTxn`)
- tritium: `renderer/worker/server/services/undo/historyStep.ts`、`hooks/useUndoRedoState.ts`、
  console の `runCommand.ts`

テスト: `src/tests/qsys/test_undomanager.cpp`、`renderer/__test__/undoStepHistory.test.ts`。

## 1. 失敗したら履歴を捨てる

- `EditInfo` には、「`false` を返すときや例外を投げるときは何も変えていない」という契約が無い。
  実際に、変えてから失敗するものがある (`TrajBlockEditInfo::undo` は block を消した後の frame 読み込みの
  例外を `false` にする)。そのため、失敗した step の前の状態に scene を戻すことは、確実にはできない。
- そこで、undo / redo / rollback のどれかが失敗したら、**undo と redo の履歴をすべて捨てる**
  (`UndoManager::dropHistory`)。今の scene に合わない記録を残すと、次の undo / redo がその上に差分を当てて
  scene をさらに壊すため。成功した `EditInfo` を逆に実行して戻す補償はしない (保証にならないため)。
- 失敗の前に成功した step は、その時点で scene と履歴が一致している。
- undo / redo は、step を**成功してから**反対側のスタックに移す。
- rollback (`rollbackTxn`。編集が失敗したときに `withUndoTxn` / `undoTxnResult` が呼ぶ) で pending の変更を
  取り消せなかったときも、同じく履歴を捨てる。取り消し損ねた変更の上に、古い redo が当たらないようにするため。
- 履歴を捨てたら、`Scene` が `SCE_SCENE_UNDOINFO` の event を出す (`takeHistoryDropped` を見て)。
  tritium の History と Undo / Redo のボタンは、これで空になる。
- 失敗した step の説明と例外の文言は、message log に出る (`UndoManager> undo of "..." failed ...`)。

## 2. 記録を止めたままにしない

- undo / redo / rollback の実行中は記録を止める (`m_fDisable`)。止める範囲は、scope を抜けると必ず戻る
  guard (`DisableGuard`) で書く。そのため、例外で抜けても以後の編集は記録される。
- rollback の実行中も記録を止める。取り消しの処理が、取り消している途中の transaction に足されないように
  するため。
- `EditInfo` の例外 (`qlib::LException`、`std::exception`、それ以外) は `runStep` の中で捕まえて失敗として
  扱い、`UndoManager` の外には出さない。

## 3. ユーザーへの伝え方 (tritium)

- worker の `undo` / `redo` service (`historyStep.ts` の `stepHistory`) は、`depth + 1` 個を `scene.undo(0)` で
  1 step ずつ実行する。C++ の `Scene.undo(n)` は真偽値しか返さないので、どこで失敗したかを知るため。
  - 結果は `Result<{ done }>`。1 step も無ければ `not-found` (`nothing to undo`) を返す。
  - 失敗したら `native` を返す。文言は、成功した数と失敗した step の説明、履歴を消したこと、scene が途中まで
    変わりうることを含む。
    例: `Undid 1 step; undo of "pym: select ..." failed, so the undo history was cleared. The scene may be partly changed.`
  - C++ が undo できないとした step (`EditInfo::isUndoable` が false) では、何も実行せずに止まり、履歴も残す。
  - 失敗したときも、action log の行を C++ のスタックに合わせる (`syncActionRows`)。
- GUI (`useUndoRedoState` の `pickUndo` / `pickRedo`。Edit メニュー、Cmd+Z、toolbar、履歴の dropdown が通る):
  `native` の失敗を error alert (タイトル `Undo` / `Redo`) で出す。`not-found` は何も出さない。
- console の `undo` / `redo`: service の文言をそのまま `Error: ...` で出す。`nothing to undo` は、本当に
  何も無いときだけ。
