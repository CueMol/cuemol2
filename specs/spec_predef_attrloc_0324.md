# Attribute location実装変更
glslの機能の、predefinedなconstantのattribute location値を使用するように変更する
src/modules/molvis/sphere_{vertex,frag}.glsl
src/gfx/DrawObj2.{hpp,cpp}
のみを対象とする。
ただし、shaderのcodeは他のコードでも使っているので、
元のコードは変更せず、
sphere2_vertex.glslなどコピーしてから変更する。
