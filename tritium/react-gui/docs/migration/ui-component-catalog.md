# UI Component Catalog (form-kit)

> ラベル+コントロールの UI は **必ず form-kit カタログのコンポーネントで組む**。
> サイズ（コントロール高・行高・label gap・section spacing）は**カタログが所有**し、
> 呼び出し側は size を選べない。これにより「トークンの中から数値を選ぶ＝サイズを選ぶ」
> という再発要因を仕組みで排除する。

カタログ: `react-gui/src/renderer/components/widgets/form/`
サイズ単一ソース: `react-gui/src/renderer/styles/_form-kit.css` ＋ `_variables.css` の `--field-*` / `--form-*` トークン。

## なぜカタログか

`--space-*` / `--ctrl-h-*` などのトークンは「どの値か」を統一するが、**値を選ぶ行為自体がサイズ選び**になり強制力にならない（typography の `.type-*` role がテキストで解決したのと同じ問題が、コントロール高・行・余白の軸に残っていた）。カタログ component は size props を公開しないので、**同じ component を使えば必ず同じサイズ**になる。

## コンポーネント一覧（これを使う / 独自に作らない）

| コンポーネント | 用途 | canonical サイズ (source) |
|---|---|---|
| `Field` | label + control の1行（stack / `inline`） | 行 padding `--field-row-pad`, label↔control gap `--field-label-gap`, label は `.type-label` role |
| `FieldGroup` | Field の縦スタック / セクション | 行間 `--form-row-gap`, section 間 `--form-section-gap` |
| `SectionHeader` | サブセクション見出し | 既存 `.section-header` role (高 `--ctrl-h-md`) |
| `TextField` | 単一行テキスト入力（任意で `leftIcon` = フィルタ/検索アイコン） | 高 `--field-h` (22px) |
| `SelectField` | ドロップダウン | 高 `--field-h` (22px) |
| `NumericField` | 数値（任意で slider 同梱） | 入力高 `--field-h-sm` (20px) |
| `SwitchField` | 真偽トグル（`inline` Field 内で使う） | Blueprint Switch |
| `ColorField` | 色（`CueColorField` の薄いラッパ） | - |
| `ButtonRow` / `FormButton` | コンパクトボタンの行 / ボタン | ボタン高 `--field-btn-h` |

## 使い方

```tsx
import { FieldGroup, Field, TextField, SelectField, SwitchField } from '../widgets/form'

<FieldGroup title="Appearance">
  <Field label="Name"><TextField value={name} onChange={setName} /></Field>
  <Field label="Style"><SelectField value={style} onChange={setStyle}>{opts}</SelectField></Field>
  <Field label="Visible" inline><SwitchField checked={vis} onChange={setVis} /></Field>
</FieldGroup>
```

## ルール

- **新規の label+control UI は本カタログのみで組む。** コントロール高・行高・label gap・section spacing を component CSS や inline `style` で**指定しない**。
- 必要なコントロールがカタログに無い場合は、**先にカタログへ 1 つ追加**（`_form-kit.css` にサイズを 1 定義）してから使う。consumer 側でサイズを決めない。
- サイズを変えたい時は **トークン（`_variables.css` の `--field-*` / `--form-*`）か `_form-kit.css`** を編集する（1 箇所）。consumer の CSS は触らない。
- 特殊な dense widget（例: SelectionBuilder）で component 化が困難な箇所は、`.selbuilder` のように **スコープした CSS から `--field-*` トークンを参照**してサイズを単一ソース化する（生の px を書かない）。
- **lint は補助**: 生ハードコード値の検出（`declaration-strict-value`）のみで、サイズ一貫性の主機構ではない。一貫性はカタログ component が担保する。

## 既存 UI の対応（インベントリ → canonical）

| 論理コンポーネント | 旧・分裂実装 | 現 canonical |
|---|---|---|
| labeled 行 | `.insp-prop-row` / `.selection-row` / `.snf-row` / `.config-setting` | `Field` |
| text input | `.insp-input`(22) / dialog `.bp5-input`(26) / mol-sel-list(30) | `TextField` (22) |
| select | `.insp-select`(22) / `.selection-mol-select`(28) | `SelectField` (22) |
| numeric | `.insp-numeric-input`(20) / `.snf-number`(20) | `NumericField` (20) |
| switch | `.insp-switch` | `SwitchField` |
| compact button | 20/22/24/26px | `FormButton` (`--field-btn-h`) |

### 移行状況 / 残タスク（段階移行）

- **済**: form-kit カタログ新設、Inspector `PropEditors`（`Field`/`TextField`/`SelectField`/`NumericField`/`SwitchField`/`ColorField`）、`ObjectSelect`（`Field`+`SelectField`）、`SelectionPane`（`Field`+`TextField`）、`MolSelList`（`TextField`）、`SelectionBuilder`（`.selbuilder` を `--field-*` 参照に）。
- **残（incremental）**: `GenericTab` / `RenderPanel` / `RenderSettingsEditor` の直接 `.insp-*` 利用、`SettingRow`（`.config-setting`）、`SliderNumericField`（`.snf-*`）、`_dialog.css` の 26px 入力。これらは `--field-*` トークン参照に揃え済み/未済が混在。新規変更時にカタログへ寄せる。
