# 指示書: Selection Builder UI の実装プラン作成

あなた（Claude Code）への依頼は、**実装そのものではなく、実装計画（プラン）の作成**です。
このドキュメントで示す UI 仕様を満たすための具体的なプランを、**実際のコードベースを調査した上で**作成してください。

> **重要:** これは「プランを作る」ための指示書です。いきなりコードを書き始めないでください。
> まずリポジトリを調査し、後述の「成果物」に挙げたプラン文書を出力することがゴールです。

---

## 1. 背景とゴール

tritium/react-gui の Mol Selection Panel
tritium/react-gui/src/renderer/components/widgets/MolSelList/
は React/Blueprint.js ベースの既存移植版であり、
文法を知らなくても選択文を組み立てられる
**Selection Builder**（Popover 内 UI）として実装されているが、
が、不完全であるので、刷新する。
ただし、すでにある他のUIとのUXを統一感を持たせる.とくにcss paramはハードコードしないなど、docs, CLAUDE.mdに記述されたUXの規約に従う。

選択文法の正式リファレンスはこれ（TS 側にハードコードする。バックエンドからは取得できない）:
- https://cuemol.github.io/cuemol2_docs/cuemol2/SelSyntax/
- https://github.com/CueMol/cuemol2_docs/blob/main/docs/ja/cuemol2/SelSyntax.md

---

## 2. UI の設計コンセプト（確定済み）

論理演算（and/or/not）をユーザーに直接書かせず、**集合演算ボタン**に落とし込む。
スタックや逆ポーランドは導入せず、**単一の「現在の選択（current selection）」を被演算対象**とし、
そこへ単項的に操作を重ねていくモデルとする。

- **current selection** … 組み立て中の選択式（1 個）。全操作の対象。
- **term** … current selection に適用する選択の単位。3 ソースから供給:
  - `Property`（文法のリテラルを keyword + value で入力）
  - `Named`（定義済み named selection。CueMol のマクロもここに統合する）
  - `History`（過去の current selection 値）
- **term を current selection へ適用する二項演算**: `Set` / `Add` / `Intersect` / `Sub`
- **current selection 自体への単項変形（Modify）**: `Not` / `Byres` / `Sidechain` / `Mainchain` /
  `Around <Å>` / `Expand <Å>`
- **Save as…** … 現在の current selection に名前を付けて named selection として保存
  （= 括弧やネストの代替。例: `A intersect (B or C)` は先に `B or C` を保存してから使う）
- **Apply to selection** … current selection を確定し、親（テキスト欄/選択状態）へ反映

### 二項演算と生成式の対応
| ボタン | 生成式 | current selection が空のとき |
|--------|--------|------------------------------|
| Set | `term` | 有効（置換） |
| Add | `(current) or (term)` | 無効化 |
| Intersect | `(current) and (term)` | 無効化 |
| Sub | `(current) and not (term)` | 無効化 |

### 単項変形と生成式の対応
| ボタン | 生成式 | 引数 |
|--------|--------|------|
| Not | `not (current)` | なし |
| Byres | `byres (current)` | なし |
| Sidechain | `bysidech (current)` | なし |
| Mainchain | `bymainch (current)` | なし |
| Around | `(current) around <d>` | 距離 d（Å、共有フィールド） |
| Expand | `(current) expand <d>` | 距離 d（Å、共有フィールド） |

- 式生成は常に各項を括弧で包み、演算子優先順位の事故を防ぐ。
- `Around` と `Expand` は **距離入力フィールドを 1 個共有**し、値を入れてどちらかのボタンを押す。

---

## 3. term の網羅（文法リテラルを全てカバーする）

`Property` ソースの keyword ドロップダウンには、文法の選択リテラルを **可能な限り全て**含める。
keyword ごとに value 入力欄の形が変わる点に注意（プランで入力 UI の出し分けを設計すること）。

- `all` / `none` … 値なし（keyword 選択のみで term 確定）
- `elem`（省略 `e;`）… 名前リスト（元素名）
- `name`（`n;`）… 名前リスト（原子名）
- `resn`（`r;`）… 名前リスト（残基名）
- `resi` / `resid`（`i;`）… 数値リスト（範囲 `:`、insertion code 対応）
- `chain`（`c;`）… 名前リスト（チェイン名）
- `alt` … 名前リスト（altloc ID。`null` を含められる）
- `bfac` … 比較演算子（`<` / `>` / `=`）+ 整数値
- `rprop` … `name=value` 形式（例 `secondary=helix`）
- `hierarchical` … `chain.resid.aname`（3 フィールド。`*` 可。`chain X and resid Y and name Z` の糖衣構文）

**名前リスト/数値リストの仕様**（プランに反映すること）:
- 名前リストはカンマ区切り、正規表現 `/^A.../ ` 混在可。`"` で囲むと大小区別・特殊文字可。
- 数値リストはカンマ区切り、`number` または `number1:number2` の範囲。残基番号は insertion code（`20A` 等）可。

**未実装で UI から除外するもの**: `neighbor` / `extend`。

---

## 4. UI レイアウト（確定済み・上から下への一方向動線）

Popover 内、幅 ~400px 程度。上から順に 4 ブロック:

1. **Current selection** ブロック
   - 現在の式（monospace 表示）+ ヒット原子数バッジ
   - 直下に `Modify` 見出し + 単項変形ボタン群（Not/Byres/Sidechain/Mainchain）
   - その下に距離共有グループ（`Distance [__] Å  [Around] [Expand]`）
   - その下に `Clear`（破棄）と `Save as…`（名前保存）
2. **Term** ブロック
   - ソース切替セグメント（Property / Named / History）
   - Property 選択時: keyword セレクト + value 入力欄（keyword 連動で形が変わる）
   - term 単独のプレビュー式 + 単独ヒット原子数
3. **Apply term** ブロック
   - `Set` / `Add` / `Intersect` / `Sub` の 4 ボタン
   - 各ボタンに「適用後のヒット原子数」をバッジ表示（空選択を意図せず作らないため）
4. **Apply to selection** ボタン（確定）

> このレイアウトを忠実に再現するための React/Blueprint コンポーネント構成をプランで設計すること。
> 既存の `SelectionPane.tsx`（テキスト欄 + molecule セレクト）に、Popover トリガ（caret ボタン等）を
> 追加して開く形を想定。テキスト欄は引き続き single source of truth とし、Builder からは
> Apply 時に式を流し込む一方向同期（テキスト→Builder の逆パースは実装しない）とする。

---

## 5. 原子数表示（空選択の予防）

- term 単独のヒット数、current selection の現在ヒット数、各 Apply ボタン押下後のヒット数を表示したい。
- これらは backend へ「式 → 原子数」を問い合わせる必要がある。**配線方法は後述（§7）の通りプランで設計**。
- UI 側は loading 状態（`number | "loading" | undefined`）を扱える前提で設計すること。
- 空（0 原子）になる演算はボタンに警告表示する余地を残す。

---

## 6. 候補補完（chain/resn/elem 等）

- value 入力欄は、対象 molecule から取得できる候補（chain 名、residue 名、element 等）の
  オートコンプリート/サジェストを効かせたい。
- **この候補取得 API は既存のコードベースに存在する**。プラン作成時に実際の API を特定し、
  どの keyword にどの候補ソースを結線するかを設計に含めること。

---

## 7. バックエンド配線（← Claude Code が実コードを見て判断する箇所）

**この指示書ではバックエンド接続の具体は規定しない。** あなたが実際のコードベースを調査し、
以下を自分で判断してプランに落とし込むこと:

- 「選択式 → 原子数」を取得する手段（既存 IPC チャネル/サービス/API があるか、無ければ新設の要否と方式）。
- chain/resn/elem 等の候補値を取得する既存 API の特定と、その呼び出し口。
- named selection の保存/読込ストアの所在（CueMol の既存 named selection 機構があるか、
  electron-store か、シーンファイルか）。`Save as…` と `Named` ソースはここに結線する。
- current selection の初期値（空始まりか、ビューアの現在選択を引き継ぐか）。引き継ぐ場合の取得経路。
- Apply to selection 時に確定式をどこへ反映するか（既存の選択コマンド/IPC ディスパッチ経路）。

これらは **実装方針として確定する前に、リポジトリ内の既存パターン**
（IPC チャネルの命名、サービス層、custom hooks、electron-store の使い方等）を調査し、
**既存の流儀に合わせる**こと。UI コンポーネントは backend 非依存に保ち、
データ取得/保存は注入可能なインターフェース（props / hook）として切り出す設計を推奨する。

---

## 8. 制約・既存の流儀（プランはこれらに従う）

- スタック: Electron + React + TypeScript、UI は Blueprint.js、リサイズは Allotment。
- 状態管理は「使う場所の近く」に置く方針。Builder の組み立て中状態（current selection 式、
  term ドラフト、ソース切替、原子数の loading）は Builder ローカル（`useReducer` 等）で持つことを想定。
- 確定式の所有は親（SelectionPane）側。
- テスト: フロントは Vitest。プランにはユニットテスト方針（特に式生成ロジック、名前/数値リストの
  パース・整形、各演算の式組み立て）を含めること。式生成は純粋関数として切り出しテスト可能にする。
- コードコメントは英語、生成する markdown ドキュメントは日本語。
- ファイル構成はモジュール性重視（コンポーネント別 CSS、barrel export、IPC 境界をまたぐ TS 型の一貫性）。

---

## 9. 成果物（あなたが出力するもの）

以下を含む **実装プラン文書（日本語の markdown）** を作成すること。コードは書かない。

1. **コードベース調査結果**: §7 の各項目について、実際に存在する API/IPC/ストアと、その所在
   （ファイルパス・関数名）。存在しない場合は新設提案とその根拠。
2. **コンポーネント構成案**: 新規/変更するファイル一覧、各コンポーネントの責務、props、
   状態の持ち場、barrel export 構成。`SelectionPane.tsx` への組み込み方法。
3. **状態モデルとデータフロー**: `useReducer` の state/action 設計、式生成の純粋関数の I/F、
   一方向同期の流れ、原子数取得・候補取得・named selection 保存の注入インターフェース。
4. **文法カバレッジ表**: §3 の各 keyword について、value 入力 UI の形・パース/整形ロジック・
   生成される syntax 文字列の対応表。
5. **段階的実装ステップ**: 検証可能な小ステップに分割（例: 式生成純粋関数 → UI 骨格 →
   ソース切替 → backend 配線 → 原子数表示 → named 保存）。各ステップの完了条件を明記。
6. **テスト計画**: Vitest で何を検証するか（式生成・リストパースを中心に）。
7. **未確定事項/要確認リスト**: 調査で判断がつかずユーザー確認が必要な点。

プラン提示後、ユーザーの承認を得てから実装に着手すること。
