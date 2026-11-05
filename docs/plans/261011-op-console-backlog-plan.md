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

GUI の操作のうち、op の組み合わせで表せないもの (2026-11-06 に GUI の呼び出しと op を突き合わせて確認)。
読み取りだけの service (原子・material・style set の中身・camera の表示設定などの一覧) は、必要になった
ときに op にする。

| 分野 | GUI の操作 | 足りないもの |
|---|---|---|
| style | renderer の右クリック > Create Style (`createStyleFromRenderer`) | op が無く、undo の txn も開かない |
| scene | 新しい scene / tab (`createNewSceneAndView` / `createViewInScene`) | op は今の scene に対して動くので、scene を作る op が無い |
| scene tree | node の Copy (`copyNode` / `copyNodes`) | node の XML を取る op が無い (Paste は `paste_node`) |
| file | Get PDB の形式オプション (`streamLoadFromUrl`) | `fetch_pdb` / `fetch_url` に reader のオプションが無い |
| file | Scene の Save As の writer オプション | `save_scene` は `path` だけ |
| レンダリング | 動画・POV-Ray のレンダリング (`renderStart`) | `render_image` は Umbreon の静止画だけ |
| レンダリング | Export の Umbreon 画像 (`exportScene`) | `export_scene` の format に `umbreon` が無い |
| view | 対称分子の原子へ Center (`naviCenterAtSymm`) | symm renderer の原子を指す op が無い (視点なので記録はしない) |
| MD | trajectory を開く・block の編集 (mdtools) | plugin から op を足す仕組みが無い |
| agent | ラベル編集・結合編集、APBS・morph・アニメーション編集 | console / MCP の op はあるが agent には出していない (`tool: false`) |

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
