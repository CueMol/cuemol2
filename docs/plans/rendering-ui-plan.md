# 指示: レイトレーシングレンダリング UI（案C）の実装計画を作成する

## 背景とコンテキスト

### プロジェクト

- リポジトリ: `tritium/react-gui`（CueMol2 のモダン化プロジェクト）
- 既存アーキテクチャの詳細は `src/App.tsx` 冒頭のコメントを参照
- 既存ドキュメント `docs/` 配下のmigration関連も参照のこと

### 旧 UI uxp_gui（移植元）

CueMol2 の旧バージョンでは、レイトレーシングレンダリング機能は **モードレスダイアログ**として実装されており、以下を含んでいました：

- "Main options" タブと "POV-Ray options" タブの2タブ構成
- 画像サイズ、投影方式、ステレオ設定、品質設定、出力ファイル指定、POV-Ray 固有オプション
- Start ボタン、進捗バー、レンダリング結果プレビュー（小さなサムネイル）
- 結果画像の保存ボタン

旧 UI の実装は別リポジトリ **`uxp_gui`** にあります。実装計画を立てる前に、
既存ドキュメント `docs/` 配下のmigration関連を参照し、
uxp_gui のレンダリングダイアログ実装を調査して、移植すべき機能を漏れなく洗い出してください。

---

## 採用する設計方針（案C + アプローチ1）

以下の方針は **確定事項**です。計画書ではこの方針に従ってください。

### 案C: Inspector の対象種別を概念ごと拡張する

- Inspector の責務を「現在フォーカスされているコンテキストのプロパティエディタ」と再定義する
- 既存の対象種別（renderer / object / scene / view）に加えて、**5番目の対象種別として `renderSettings` を追加**する
- Render Settings の永続化は行わない
- Inspector ヘッダーで、現在編集中の対象種別を視覚的に明示する

### アプローチ1: レンダリング結果は新しいタブとして表示

- レンダリング完了時、ContentArea に **新しいタブ**として結果画像を開く
- MolView タブの中で WebGL canvas と画像表示をトグルする方式は採用しない
- 結果タブは独立したタブとして履歴的に残せる（複数回レンダリングしたら複数の結果タブが並ぶ）
- 結果タブには元シーンへの参照を保持する

---

## あなたが計画書で設計すべき主要な論点

以下の論点について、計画書で **設計判断とその根拠**を明示してください。

### 論点1: 機能の責務分担

uxp_gui のレンダリングダイアログにある機能を、3つの場所に分担させる必要があります：

1. **Inspector Panel（Render Settings ターゲット時）** — 設定値の編集
2. **BottomPanel の新タブ "Render"** — 実行操作、進捗、ログ
3. **ContentArea の Render Result タブ** — 完了後の結果表示と保存操作

各機能（画像サイズ、品質、Start ボタン、進捗バー、Save 操作 など）を、上記3カ所のどこに配置するかを **網羅的に表形式で**示してください。判断基準も明文化してください（例: "設定値の編集は Inspector、状態遷移を伴う操作は BottomPanel" のような原則）。

### 論点2: Inspector における設定のグルーピング

Inspector の Render Settings は項目数が多くなります。既存の `RendererPropertyEditor` と一貫した方法（アコーディオン or SegmentedControl）でグループ化してください。グループ案を提示し、各グループに入る項目を列挙してください。

参考方針（Blender を参考にした例。あなたが調整して良い）:
- Image（解像度、プリセット、スケール）
- Camera（投影、ステレオ）
- Quality（スレッド、エッジライン）
- Output（ファイル形式、保存先、背景透過）
- Advanced / POV-Ray（POV-Ray 固有オプション）

### 論点3: レンダリング起動経路

レンダリング開始は複数経路から可能であるべきです：

- Toolbar の Render ボタン/メニュー
- F12 ショートカット
- BottomPanel の Render タブ内 Start ボタン
- 結果タブからの "Re-render with these settings"

各経路の挙動（Inspector を開くか、即座に実行するか、確認ダイアログを出すか等）を仕様化してください。

### 論点4: 進捗表示の階層

進捗情報をどこに表示するかを整理してください：

- StatusBar に常時表示するか、しないか
- BottomPanel の Render タブにのみ表示するか
- 両方の場合、どの情報をどちらに出すか

階層の原則（"概要は StatusBar、詳細は BottomPanel" のような）を明示してください。

### 論点5: Render Result タブの仕様

結果タブが持つべき UI 要素を仕様化してください：

- タブタイトルの命名規則（例: `🎬 Scene1 — 1216×612 (15.2s)`）
- 画像ビューアの機能（ズーム、Fit-to-View、Pan、100% 表示）
- ツールバーのアクション（Save Image, Copy to Clipboard, Show Settings, Re-render, Show Source Scene 等）
- 元シーン情報の表示方法
- レンダリング設定スナップショットの表示方法

### 論点6: 型定義と状態管理

実装に必要な型定義の概要を示してください。少なくとも次のものを含むこと：

- `InspectorTarget` を discriminated union として再定義（既存4種類 + `renderSettings`）
- `RenderSettings` の型（設定値のスキーマ）
- `RenderJob` または相当の型（実行中ジョブの状態）
- `RenderResult` の型（結果タブが保持するデータ）
- `TabData` の `kind` フィールドへの "renderResult" 追加（または相当の拡張）

状態管理について、新規に必要な custom hook（例: `useRenderJob`, `useRenderSettings`）と、既存 hookへの変更点を整理してください。

### 論点7: IPC / バックエンド連携の境界

IPC で実際の POV-Ray バックエンドに繋ぐための、**フロントエンドとバックエンドの境界を抽象化**してください。

- レンダリング実行の API 形（例: `window.electronAPI.renderStart(settings) => jobId`）
- 進捗通知の API 形（例: `onRenderProgress(callback)`）
- 完了通知の API 形（例: `onRenderComplete(callback)`）

### 論点9: 実装フェーズ分割

計画書の最後で、実装を **段階的に進めるためのフェーズ分割**を提案してください。
各フェーズが独立して動作確認できる単位であること
（例: フェーズ1で Inspector に Render Settings タブが出るところまで、
フェーズ2で BottomPanel に Render タブを追加してプログレス mock 動作、というように）。

---

## 留意事項

- 計画書は **実装が始められる粒度**まで具体化してください（コンポーネント名、props 概形、関数シグネチャの概要を含む）
- ただし**実コードは含めないでください**（型定義の interface は要点を絞れば可、説明用の擬似コードも最小限に）
- 設計判断で複数の選択肢で迷う場合は、選択肢を表形式で提示し、推奨を明示してください
- 既存コードの読解で見つけた重要なアーキテクチャ上の制約（特に `useLayoutPersistence`, Allotment のネスト構成、Inspector の表示制御）を尊重した設計にしてください
- uxp_gui の調査でアクセスできないリポジトリやファイルがあれば、計画書の「未解決事項」セクションに明記し、ユーザーに確認を求めてください

---

## 作業手順の推奨

1. まず `tritium/react-gui` の現状コード（特に `App.tsx`, `useInspectorState`, `InspectorPanel`, `BottomPanel`, `ContentArea`）を読んで現状を把握する
2. `uxp_gui` リポジトリで POV-Ray レンダリングダイアログの実装を探索し、機能を洗い出す
3. 機能の責務分担を設計する
4. 型定義とコンポーネント構造を設計する
5. 計画書を `docs/plans/render-ui-plan.md` として書き出す
6. ユーザーに計画書をレビューしてもらう（実装着手前に必ずレビューを通すこと）

---

## 確認

計画書を作成し終わったら、以下を報告してください：

- 計画書のパス
- uxp_gui で発見した機能の総数
- 重要な設計判断のサマリ（5項目程度）
- ユーザーへの未解決質問
