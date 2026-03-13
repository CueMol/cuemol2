# gtest拡充

- src/qsys/*.cppに対するgtestを実装する
- ただし、*_wrap.cppは生成されたコードなので除外
- すでにsrc/tests/qsys/にgtest codeが一部実装されているので、まだ実装されていないものについて、実装する。
- 実装後、ビルドが通るか確認する。
  - ビルドは、
cd build_scripts/ && task build_libcuemol2
で確認する
  - エラーが出るようなら、エラーに基づいて修正
- さらに、テストが通るか確認する。
  - testは、build_libcuemol2後に、
  cd build_scripts/ && task run_gtest
  を実行して走らせる
  
