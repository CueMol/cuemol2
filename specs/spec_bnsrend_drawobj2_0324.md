# ballstick rendererのDrawObj2化
ballstick rendererの実装を、DrawObj2化する。
ballstick rendererの実装は、
src/modules/molvis/BallStickRenderer.{hpp,cpp}
にある。
今の実装は、GLSLSphereHelper/GLSLCylinderHelper.hppを使用した実装で、sysdepに依存したコードになっているが、
これを、gfx::SphereDrawObj2/gfx::CylinderDrawObj2をもちいることで、sysdepに対する依存をなくする。

# USE_OPENGLマクロを使わなくて済むように
`#ifndef USE_OPENGL`
などのマクロを使わないようにする。
OpenGLなどGUI backendが使えない場合は、loadShaderObjectがnullptrをかえし失敗するはずなので、
init()がfalseを返すはずなので、それで判断するコードにする。

# その他
もし、DrawObj2側に実装に必要なインタフェイスやコードがない場合は拡充を検討する
前回のセッションで、SphereDrawObj2の実装を、オリジナル
src/modules/molvis/GLSLSphereHelper.hpp
に忠実に実装せず、instanced drawingに変更したため動かなくなっていた。
同様のことがcylinderでも起こる可能性があるため、オリジナル
  - src/modules/molvis/GLSLCylinderHelper.hpp
に沿った実装になっているか確認し、なっていないようなら修正する。
