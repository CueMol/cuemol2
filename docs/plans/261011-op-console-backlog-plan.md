# op / console / MCP の未実装項目 (backlog)

Status: **未実装 (候補の一覧)**。着手するときは項目ごとに計画を起こし、実装したらこの表から消す。
実装済みの仕様は [op catalog と console](../architecture/op-catalog.md)、
[local API server](../architecture/local-api-server.md)、
[console の補完](../architecture/console-completion.md)、
[console help の Markdown](../architecture/console-help-markdown.md)、
[AI agent plugin](../architecture/ai-agent-plugin.md)。
PyMOL dialect のコマンドの残りは [260928](260928-pymconsole-remaining-plan.md)。

## 1. op 基盤: 記録・再生と undo の連携

op ごとの記録と qax での再生は実装済み ([action-log.md](../architecture/action-log.md))。残りは次のとおり。

| 項目 | 内容 |
|---|---|
| マクロの残り | 引数が 2 つ以上のマクロと、実行時に引数を入れる UI。範囲の外で作られた renderer を型などで指して、History の step をマクロにする。console からのマクロの呼び出し (`run x.qax` は今 `<action>` だけを再生する) |
| ファイルへのバッチ実行 | フォルダ・マクロ・出力 (画像 / 保存) を指定するダイアログ。ファイルごとに 読み込み -> マクロ -> 出力 -> 片付け を繰り返す。進捗の表示、中断、失敗したファイルの一覧 |
| 録画ボタン | 開始で History に印を付け、終了で印から今までを選んだ状態にして Save to Actions を開く。記録の仕組みは History と共有し、録画中であることはステータスバーに出す |
| preset の追加 | 既存の op で表せず外したもの: chain ごとの色、初期表示 (simple) に戻す、輪郭線 (renderer を一括で指す op)、重ね合わせ (object 2 つ) |
| 記録の対応表の拡充 | [261013-action-record-coverage-plan.md](261013-action-record-coverage-plan.md) |
| undo 履歴の永続化 | action log を scene と一緒に保存するか、別ファイルにするか |
| qax の C++ 移行 | コマンド系とあわせて qax の読み書きを C++ に移す。golden file で同じ形式を検証する |
| context 参照の ref | 意味型の ref で「アクティブな object」「現在の selection」を指せるようにする |

## 2. op になっていない機能

GUI の service はあるが op が無く、agent / console / MCP から使えないもの
(2026-10-11 時点で `renderer/worker/server/catalog/` に参照が無いことを確認)。

| 分野 | service | メモ |
|---|---|---|
| scene tree | `copyNode` / `pasteNode` (`services/clipboard/`) | |
| renderer | `getMaterialNames` (`services/rend/getMaterialNames.ts`) | material の一覧 |
| view | `setViewCenterMark` (`services/view/viewProjection.ts`) | 専用 op は無いが、`set_node_prop` で view の `centerMark` を設定できる |
| 対称性 | `createSymmMol` (`services/molops/createSymmMol.ts`) | `show_symmetry` は symm / unit cell の renderer のみ |
| selection | `getMolAtoms` | 原子の一覧 |
| 着色 | multigrad 系 (`getMultiGradState` / `setMultiGradNodes` / `setMultiGradColorMap` ほか) | |
| file / scene | `listSavableObjects` | `save_object` は対象を指定して使う |
| レンダリング | POV-Ray 出力 | |
| アニメーション | 追加できない型 (`RealPropAnim` / `RendXformAnim`、ファイル由来) の generic property | |
| agent | ラベル編集・結合編集、APBS・morph・アニメーション編集 | APBS 以下は console / MCP の op はあるが agent には出していない (`tool: false`) |

## 3. MCP / agent

| 項目 | 内容 |
|---|---|
| resource `cuemol://scene/active` | scene の要約を MCP resource として出す。今の capabilities は `tools` のみ |
| introspection tool | `list_capabilities` のような tool で、詳しい説明を必要なときに引かせる |
| dev 専用の `run_pymol` tool | console の 1 行 (PyMOL dialect) を実行する tool。LLM の PyMOL 構文の強さを確かめる実験用で、正式な interface にはしない。PyMOL dialect は今も local API の `/console/run` と `tritium_cli` から使える |
| `tools/list_changed` | server は stateless で送っていない。tool の追加は client の再接続で反映 |
| 実行中の call を GUI から止める UI | 今は client 側の中断でしか止まらない |
| provider の tool search (`deferLoading`) | agent の toolset の代わりに provider 側で tool を遅延ロードする最適化 (Anthropic / OpenAI のみ) |
| headless MCP server | Node + `@cuemol/core` を stdio で。描画が OffscreenCanvas / WebGL 依存で画像を返せない、worker service が vite 依存で別 bundle が要る、のため今は採らない。バッチ解析用途が要るときに再検討 |
| Python binding + FastMCP | `src/pybr` の standalone module としての現状が未確認 |

## 4. console 本体 (dialect 共通)

| 項目 | 内容 |
|---|---|
| help 以外の Markdown 出力 | op の結果などを `format: 'markdown'` に乗せる。今 Markdown なのは help だけ |
| 重いコマンドの progress / cancel | load / fetch などを既存の stream progress の経路に乗せ、進捗を出す |
| Windows の `tritium_cli.cmd` | 対話 (readline) と Ctrl-C が動くか未確認 |
| cuetty / pymod とのコマンド体系の共有 | C++ plugin レーンが入った時点で再検討 |

## 採らないと決めたもの

- ServiceMap から tool を自動生成すること (service の形が UI 都合で、説明文が無く、数も多い)。
- CmdId (GUI のコマンド) との共通化 (renderer 側の UI handler で層が違う)。
- session をまたいで一意な UID (ref は名前と `#uid` で解決し、名前が重複したら失敗させる)。
- MCP でディスクに触れる tool の確認ダイアログ / ディレクトリ制限 (localhost + token で守り、`fileAccess: 'any'`)。
