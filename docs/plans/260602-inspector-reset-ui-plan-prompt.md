# 実装計画作成の依頼: Inspector の per-property reset UI

あなたは tritium (CueMol2 のモダン化版、Electron + React + TypeScript) のコードベースに精通しています。
これは**コーディングの指示ではなく、実装計画 (plan) を作成してもらう依頼**です。
最終的な成果物は「この機能をどう実装するか」を記述した計画ドキュメントであり、実コードの変更は行わないでください。

## 背景

renderer property を編集する inspector (right side panel) において、各プロパティが
「現在 default 値かどうか」を可視化し、default に戻せる UI を追加したい。

旧 uxp_gui 版 CueMol2 には modal dialog 内に "Reset all to default" ボタンがあったが、
- GUI 上で「今の値が default かどうか」が一見して分からない
- リセットは全項目一括のみで、プロパティ単位の制御ができない

という課題があった。tritium ではこれを inspector 上で解決する。

VS Code の Settings Editor (変更行の左に色付きバー、ホバーで歯車 → Reset) と
Blender の Properties (右クリックで Reset to Default / Reset All) を参考にしている。

## 実装する UI 仕様 (この外見・挙動を計画の前提とする)

現状の simple renderer inspector は、ラベルが入力欄の**上**に来る縦積みレイアウトで、
toggle switch や Blender 風の数値スライダー (左右に chevron、塗りつぶしバー、中央に値表示) を使っている。
**この既存の見た目・レイアウトは壊さず**、以下の状態表示とリセット機構を「足す」形にする。

### 1. プロパティ単位の modified インジケータ

- 各プロパティの縦積みブロックの**左端に 3px の border-left** を持たせる。
- **非 default (modified)**: アクセントカラー (info 系の青) のバー + ブロック背景をごく薄く同系色で染める。
- **default**: バーは透明 (幅は確保してレイアウトをずらさない)、背景なし。
- 色のみに依存させず「バーの有無」自体が情報になるようにする (色覚多様性への配慮)。
- light / dark 両モードに対応する。

### 2. プロパティ単位の reset (ホバー表示)

- プロパティブロックを**ホバーしたときだけ**、ラベル行の右端に reset アイコン (戻る矢印、↩) を表示する。
- reset アイコンは **modified なプロパティでのみ**表示・有効。default のプロパティでは出さない。
- クリックでそのプロパティ 1 つだけを default 値に戻す。
- ホバー時に default 値をラベル横へ控えめに併記する (例: `Visible · default: on`, `Opacity · default: 1.00`)。
  戻す前に何になるか分かるようにするのが目的。

### 3. グループ単位 / 全体の reset

- セクション見出し (BASIC SETTINGS, SIMPLE 等の折りたたみグループ) のホバー時に、
  見出し行の右端へそのグループだけをリセットするアイコンを表示。
- inspector パネル**上部のツールバー**に "Reset all to default" を配置 (uxp_gui の全リセット踏襲)。
- 個別 / グループ / 全体のリセットはいずれも「プロパティパス (または prefix) を引数に取る単一の
  リセット操作」に集約できる設計にする。

### 4. "Show modified only" フィルタ

- inspector 上部ツールバーに、変更済みプロパティだけを表示するトグル (漏斗アイコン) を置く。
- VS Code の `@modified` フィルタ相当。

### 5. 即時適用

- 編集は即時反映 (modal の OK / Apply は持たない)。
- リセットを含む変更は undo stack に積み、undo で取り消せること (旧 modal の Cancel に相当する安全網)。

## 計画に必ず含めてほしい項目

1. **現状調査の結果**
   - 現在の simple renderer inspector を構成しているコンポーネント / hook / CSS ファイルの特定。
   - renderer property の値・default 値・modified 状態 (default かどうかの flag) が
     現在どこに存在し、どう取得できるか (cuemol core 側を含む)。コードを直接確認して記述すること。
   - 既存の数値スライダー / toggle / dropdown 等のプロパティ widget の実装場所。

2. **データフロー / 状態設計**
   - 各プロパティ行が `{ value, defaultValue, isModified }` 相当を受け取れるようにするための、
     モデル層 → hook (`useInspectorState` 等) → 行コンポーネントへの流れ。
   - `isModified` の判定責務をどこに置くか (行コンポーネントではなくモデル / hook 側に寄せる方針)。

3. **リセット操作の API 設計**
   - 個別 / グループ / 全体を「プロパティパス or prefix を取る単一操作」に統合する案。
   - undo stack への積み方。即時適用との整合。
   - cuemol core への繋ぎ込み (reset / default 値取得) の方式は、コードを確認した上で提案すること。

4. **UI コンポーネントの構成**
   - 上記の外見を実現するためのコンポーネント分割案。
   - 既存レイアウトを壊さないための、行コンポーネントへの border-left / hover 表示 / reset アイコンの
     組み込み方。Blueprint.js の利用方針 (reset は minimal small Button + Tooltip、フィルタは
     Button の active 状態など)。border-left は単一辺 border の角丸制約に注意。
   - light / dark 両対応の色 (既存のテーマ変数を使う)。

5. **段階的な実装ステップ**
   - 既存方針に沿った staged refactoring として、各段階で検証可能な単位に分割する。
   - 各段階で壊れていないことを確認する観点。

6. **テスト方針**
   - `isModified` 判定とリセット操作の純粋関数部分の Vitest 単体テスト案。

## 制約・前提

- 技術スタック: Electron + React + TypeScript、UI は Blueprint.js、レイアウトは Allotment、
  状態永続化は electron-store、テストは Vitest。
- 今回の依頼は、tritium全体にわたって使用する予定なので、h3-kitに実装する。
- **まずcatalogに実装し、UIの微調整を行ってから、inspector の実装に展開**
