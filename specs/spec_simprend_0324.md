# 目的
simple rendererを、LineDrawObj2を使った実装に切り替える

# 詳細
simple renderer
src/modules/molstr/SimpleRenderer.{hpp,cpp}
src/modules/molstr/SimpleRendererGLSL.cpp
の実装は、sysdep OpenGL に依存した形になっているが、これを、
gfx::LineDrawObj2を使った実装に切り替え、sysdep依存をなくする。

# 実装
すでに、src/modules/molvis/CPK2Renderer.{hpp,cpp}で、同様の実装を行っているので、
それと同様に変更を行う。

`#ifndef USE_OPENGL`
などのマクロを使わないようにする。
OpenGLなどGUI backendが使えない場合は、loadShaderObjectがnullptrをかえし失敗するはずなので、
init()がfalseを返すはずなので、それで判断するコードにする。

# その他
もし、DrawObj2側に実装に必要なインタフェイスやコードがない場合は拡充を検討する
