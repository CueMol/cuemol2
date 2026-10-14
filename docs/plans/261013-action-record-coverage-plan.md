# MD trajectory の編集を op として記録する 計画

## Context

History pane と Actions pane は、undo の各 step に記録された op を使う。op が記録されない step は
「no op recorded」の行になり、qax への保存・マクロ・再生に使えない。GUI・PyMOL dialect の編集は
service が op を記録する (仕様は `../architecture/action-log.md` §2.2)。残っているのは、plugin の
service が行う MD trajectory の編集だけ。

## 残りの項目

- MD trajectory (mdtools plugin): 開く (`loadTrajectory`) と、block の追加・削除・並べ替え (`trajectory.ts`)。
  - op catalog は core のものだけで、plugin から op を足す仕組みが無い。
  - その仕組み (plugin の manifest に ops を書くと、catalog・console・MCP に出る) を作るときに、
    `load_trajectory` / `add_traj_block` / `remove_traj_block` / `move_traj_block` を足す。
  - 並べ替えは、ほかの一覧と同じく行き先を `by` (動いた段数) で記録する。

## 検証

1. `task build_tritium` / `task run_tritium`。trajectory を開き、block を足す・消す・動かす。
   History の行が op の表示文になり、`list_actions` に op が出ることを確かめる。
2. その行を Save to Actions して、別の scene で Run する。
3. ユーザーの目視確認の後に、記録の形を `actionLog.test.ts` の表に 1 件ずつ足す。
4. docs: `../architecture/action-log.md` §2.2 / §2.3 と `../architecture/op-catalog.md` を更新し、この plan を消す。
