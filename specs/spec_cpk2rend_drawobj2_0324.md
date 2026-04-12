# cpk rendererのDrawObj2化
cpk rendererの実装を、DrawObj2化する。
cpk rendererの実装は、
src/modules/molvis/CPK2Renderer.{hpp,cpp}
にある。
今の実装は、GLSLSphereHelperを使用した実装で、sysdepに依存したコードになっているが、
これを、gfx::SphereDrawObj2をもちいることで、sysdepに対する依存をなくする。

# USE_OPENGLマクロを使わなくて済むように
`#ifndef USE_OPENGL`
などのマクロを使わないようにする。
OpenGLなどGUI backendが使えない場合は、loadShaderObjectがnullptrをかえし失敗するはずなので、
init()がfalseを返すはずなので、それで判断するコードにする。

# その他
もし、DrawObj2側に実装に必要なインタフェイスやコードがない場合は拡充を検討する
