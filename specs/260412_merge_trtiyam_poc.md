# cuemol3-poc2をmergeする

cuemol3-poc2が別repositoryで開発されているが、これをcuemol2側に取り込む

## 現状

- cuemol3-poc2は、
```
/Users/user1/proj64/cuemol3-poc2/
```
にある。
- cuemol3-poc2は、pnpmを用いたmonorepo構成になっている。
- cuemol3-poc2/core/以下が、nodejs/の拡張されたコードとなっている。

## 実装

- tritium/ directoryを作成する
- tritium以下に、cuemol3-poc2を移行する. tritiumをpnpmのtop directoryとする
- build_scripts/build_tritium_posix/ を作成し、build_scripts/build_nodejs_posix/run.shを参考に、tritium/以下のelectron/react版gui appをbuildするscriptを作成する。

