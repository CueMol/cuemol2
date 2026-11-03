# 原子の削除と merge の undo / redo (libcuemol2)

`MolCoord::deleteAtoms` (原子の削除) と `MolCoord::copyAtoms` (別の分子からの merge) の undo / redo の仕組み。
GUI の Delete atoms dialog・Merge molecules、op の `delete_atoms` / `merge_molecules`、
PyMOL / ChX の `remove` / `delete` は、どれもこの 2 つを通る。

実装: `src/modules/molstr/MolCoordGeomImpl.cpp` の `SavedAtoms` と `MolMergeEditInfo`、
`src/modules/molstr/MolCoord.{hpp,cpp}` の `appendAtomWithID`・`getRemovalSet`・`AtomPool::putAt`。
テスト: `src/tests/modules/molstr/test_mol_delete_undo.cpp`。

## 1. 記録するもの

edit のたびに、出し入れした原子を `SavedAtoms` に記録する。

| 項目 | 内容 |
|---|---|
| 原子 | 分子の中での数値 ID と、原子の複製 (位置・名前・altloc・B 因子など) |
| 残基 | 原子が属する残基の property (`secondary2` など) |

- 削除では、消す前に記録する。merge では、原子を足した後に、足した先での ID で記録する。
- selection は記録しない。undo と redo は、どちらも記録した原子の集合そのものを出し入れする。
  selection を評価し直すと、周りの原子に依存する式 (`around` など) や名前付き selection で、別の原子を指してしまうためである。

| | undo | redo |
|---|---|---|
| 削除 | 記録した原子を戻す | 記録した ID の原子を消す |
| merge | 記録した ID の原子を消す | 記録した原子を戻す (merge をやり直さない) |

## 2. 原子は元の ID に戻す

原子を戻すときは、その原子が最初に持っていた数値 ID に戻す (`MolCoord::appendAtomWithID`)。

- 理由: 数値 ID で原子を指すものがあるためである。新しい ID で戻すと、戻した原子がそれらから外れる。
  - 座標の undo / redo (`MolXformEditInfo`): ID の原子が無いと、黙って飛ばす。
  - selection の `aid`
  - PDB writer: 残基の中の原子を ID 順に書き出す。
- `AtomPool` は ID を使い回さない (`put` で増える一方)。そのため、消した原子の ID は、戻すまで空いたままになっている。
  `AtomPool::putAt` は、払い出し済みで、かつ空いている ID にだけ入れる。
- 残基の中の原子の並びは、原子名と altloc で整列して入る (`MolResidue::appendAtom`)。
  そのため、ID を保てば、並びも書き出しの順番も消す前と同じになる。
- 戻す前に、すべての原子について「ID が空いている」「同じ名前の原子が無い」ことを確かめる。
  1 つでも当たれば、1 つも足さずに失敗を返す。途中まで足した状態は残さない。
- 戻すたびに、記録した複製をさらに複製して入れる。記録は、次に消されても使い回せる。
- merge の redo も、この規則で戻す。merge の後に積まれた削除や座標変更の記録が覚えている ID は、
  merge の undo / redo を挟んでも届く。

## 3. altloc の連動削除

altloc の無い原子 (`CA`) を消すと、同じ名前の altloc 付きの原子 (`CA:A`、`CA:B`) も一緒に消える
(`MolCoord::removeAtomFromResidue`)。

- `deleteAtoms` は、selection に当たった原子にこの連動分を足した集合 (`MolCoord::getRemovalSet`) を、消して記録する。
  そのため、undo で連動分も戻る。
- 連動の規則は `getDraggedAltConfs` の 1 箇所にあり、実際に消す処理と記録の両方がこれを使う。

## 4. 既知の制約

- undo の途中で `EditInfo::undo` が失敗しても、`UndoManager::undo` はその txn を redo のスタックに移し、
  利用者にも知らせない。txn の中の残りの記録も実行されない。上の 2 つの edit は、§2 の確認に当たらない限り失敗しない。
- topology から作られない結合 (mmCIF の `struct_conn` など) は記録しない。
  戻した後は `applyTopology` が作る結合だけになる。
