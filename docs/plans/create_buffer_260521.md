# WebGL2 GPU Bufferの生成を効率化する

現状では、WebGL2 canvasを利用した実装では、GPU bufferを生成する際に、
- CPU (C++)でbuffer作成 (gfx::DrawAttrArray::alloc())
- C++ RendererでCPU側bufferを埋める
- createBufferで、
  - JS側に、GPU転送用 CPU (V8 TypedArray)メモリ確保(tritium/core/cxx_src/ElecView.hpp, createBuffer())
  - その際にC++ --> V8 TypedArray memcpy
  - updateの場合は、create時同様にCPU (C++) memory --> CPU (V8 TypedArray, m_arrayBufRef)へのコピーが必要だが、今は実装されていない（？）
- ElecVBOImpl::drawBuffer()で、GfxManager.drawBuffer()が呼ばれ、m_arrayBufRefからjs側でGPU描画（VRAM転送）が行われる. この際にメモリのコピーは起こらないはず（要確認）
といった流れになっている。

# copy回数の極力削減
以上の流れで、CPU内でのデータコピーは本来不要のはず。
C++側でallocしたメモリが、V8から、cageのせいでアクセスできないので、
わざわざコピーする羽目になっている。

# 実装案
以下の様に実装すれば、改善されるはず

- CPU (C++)でbuffer作成 -> gfx::DrawAttrArray::alloc()を呼ばずに、napiを介して、V8 TypedArrayのメモリを確保。
  - gfx::DrawAttrArray::m_dataは、qlib::Array型だが、qlib::Arrayは、ownではなくref modeがあるので、refer() methodを使って、TypedArrayを参照させる様に実装可能。
  - ただしメモリ管理には気をつける必要あり。
  - tritium/core/cxx_src/services.cppのfromTypedArray()の実装が使えれば、TypedArrayを参照するLByteArray (実態はqlib::Array)を作れるので、これを再利用or実装を共用できないか？
- C++ RendererでCPU側buffer (V8)を埋める
- createBufferでは、gfx::DrawAttrArray::m_dataの参照するV8 TypedArray bufferを直接js側に渡せる
  - V8 cage内のメモリなので、失敗しない
- 以下は同様に、drawBufferでGPU転送・描画

# 問題点・注意点
gfx::DrawAttrArray, gfx::DrawAttrElemでは、実装レイヤー非依存にする必要があるので、
直接napiを呼ぶことができない。
今の実装では、VBORepとその派生クラスElecVBOImplなどで機種依存レイヤーを巻き取っているが、
その枠組みに押し込めるなら、alloc()が呼ばれた段階で、すでにVBORepができている必要がある。
今の実装では、drawが呼ばれてからからVBORepが作られる様になっているので(gfx::DisplayContext::drawElem(const AbstDrawElem &ade))、
VBORepが作られるタイミングを変更する様に設計し直す必要がある。
--> これは、OpenGL側の実装にも影響を及ぼすが、正しく実装すれば、degradationは避けられるはず？

# 解決
gfx::DrawAttrArray, gfx::DrawAttrElem派生クラスは、GpuPrim派生クラスでしか作成されていない（はず）
XXXGpuPrim::alloc(...)で呼ばれるパターンになっている。
XXXGpuPrim::allocの引数に、DisplayContextを要求する様にする。
そこで、alloc/allocIndをよんでC++ memoryを確保するのではなく、
DisplayContextのbuffer alloc methodを呼んで、backendがWebGLの場合はV8 TypedArrayをallocするようにする。
それ以外のOpenGLなどの場合は、単にC++ memoryを確保する

--> DisplayContextのinterfaceを増設する必要がある。


