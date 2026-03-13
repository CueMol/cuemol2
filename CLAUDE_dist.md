# CueMol2 開発ガイド

## ビルド

初回ビルド前に依存ライブラリをダウンロードする:

```sh
cd build_scripts/ && task download_deplibs
```

ビルド実行:

```sh
cd build_scripts/ && task build_libcuemol2
```

- エラーが出た場合はエラー内容に基づいて修正する
- `Install the project...` または `-- Up-to-date:...` が表示されればビルド・インストール完了

## テスト

ビルド後にテストを実行:

```sh
cd build_scripts/ && task run_gtest
```

## gtest 実装方針

- header (hpp) と cpp ファイルに実装されたロジックをすべて検査する unittest にする

## C++ コーディングルール

- `.clang-format` に従ったフォーマットにする
- C++17 の機能が使える部分ではなるべく使う
- 既存の BOOST の機能で C++17 の機能に置き換えられる部分は置き換える
