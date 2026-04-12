//
// Electron shader object implementation for Node.js bridge
//

#include "EcShaderObject.hpp"

#include <qlib/FileStream.hpp>
#include <qsys/SysConfig.hpp>

#include "ElecView.hpp"

namespace node_jsbr {

EcShaderObject::~EcShaderObject() {}

bool EcShaderObject::loadShaders(const qlib::MapTable<qlib::LString> &file_names)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto args = Napi::Object::New(env);
    const auto &name = getName();

    for (const auto &i : file_names) {
        qlib::LString src = loadFile(i.second);
        args.Set(i.first.c_str(), src.c_str());
    }

    auto method = peer.Get("createShader").As<Napi::Function>();
    try {
        auto rval = method.Call(peer, {Napi::String::New(env, name.c_str()), args});
        bool result = rval.As<Napi::Boolean>().Value();
        MB_DPRINTLN("EcShaderObject::loadShaders <%s> result: %s", name.c_str(),
                    result ? "OK" : "Failed");
        return result;
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::loadShaders <%s> failed: %s", name.c_str(),
                    e.Message().c_str());
        return false;
    }
}

qlib::LString EcShaderObject::loadFile(const qlib::LString &filename)
{
    auto pconf = qsys::SysConfig::getInstance();
    LString fnam = pconf->convPathName(filename);

    // read source file
    qlib::FileInStream fis;
    fis.open(fnam);
    char sbuf[1024];
    qlib::LString source;
    while (fis.ready()) {
        int n = fis.read(sbuf, 0, sizeof sbuf - 1);
        sbuf[n] = '\0';
        source += sbuf;
    }
    return source;
}

void EcShaderObject::enable()
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("enableShader").As<Napi::Function>();
    auto shaderName = Napi::String::New(env, getName().c_str());
    try {
        method.Call(peer, {shaderName});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::enable %s failed: %s", getName().c_str(),
                    e.Message().c_str());
        return;
    }
    MB_DPRINTLN("EcShaderObject::enable %s OK", getName().c_str());
}

void EcShaderObject::disable()
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("disableShader").As<Napi::Function>();
    try {
        method.Call(peer, {});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::disable %s failed: %s", getName().c_str(),
                    e.Message().c_str());
        return;
    }

    MB_DPRINTLN("EcShaderObject::disable %s OK", getName().c_str());
}

void EcShaderObject::setUniform(const qlib::LString &name, int v0)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformI").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::String::New(env, getName().c_str()),
                     Napi::String::New(env, name.c_str()), Napi::Number::New(env, v0)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformI %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniform(const qlib::LString &name, int v0, int v1)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformI").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()),
                           Napi::Number::New(env, v0), Napi::Number::New(env, v1)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformI %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniform(const qlib::LString &name, int v0, int v1, int v2)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformI").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::String::New(env, getName().c_str()),
                     Napi::String::New(env, name.c_str()), Napi::Number::New(env, v0),
                     Napi::Number::New(env, v1), Napi::Number::New(env, v2)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformI %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniform(const qlib::LString &name, int v0, int v1, int v2,
                                int v3)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformI").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()),
                           Napi::Number::New(env, v0), Napi::Number::New(env, v1),
                           Napi::Number::New(env, v2), Napi::Number::New(env, v3)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformI %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniformF(const qlib::LString &name, float v0)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformF").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::String::New(env, getName().c_str()),
                     Napi::String::New(env, name.c_str()), Napi::Number::New(env, v0)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformF %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniformF(const qlib::LString &name, float v0, float v1)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformF").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()),
                           Napi::Number::New(env, v0), Napi::Number::New(env, v1)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformF %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniformF(const qlib::LString &name, float v0, float v1,
                                 float v2)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformF").As<Napi::Function>();
    try {
        method.Call(peer,
                    {Napi::String::New(env, getName().c_str()),
                     Napi::String::New(env, name.c_str()), Napi::Number::New(env, v0),
                     Napi::Number::New(env, v1), Napi::Number::New(env, v2)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformF %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setUniformF(const qlib::LString &name, float v0, float v1,
                                 float v2, float v3)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setUniformF").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()),
                           Napi::Number::New(env, v0), Napi::Number::New(env, v1),
                           Napi::Number::New(env, v2), Napi::Number::New(env, v3)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setUniformF %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setMatrix(const qlib::LString &name, const qlib::Matrix4D &mat)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    // Column-major: ai(1)..ai(16) maps to m_value[0..15]
    auto arr = Napi::Float32Array::New(env, 16);
    for (int i = 0; i < 16; ++i) arr[i] = static_cast<float>(mat.ai(i + 1));
    auto method = peer.Get("setMatrix").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()), arr});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setMatrix %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

void EcShaderObject::setMatrix(const qlib::LString &name, const qlib::Matrix3D &mat)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    // Column-major: ai(1)..ai(9) maps to m_value[0..8]
    auto arr = Napi::Float32Array::New(env, 9);
    for (int i = 0; i < 9; ++i) arr[i] = static_cast<float>(mat.ai(i + 1));
    auto method = peer.Get("setMatrix").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::String::New(env, name.c_str()), arr});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setMatrix %s.%s failed: %s", getName().c_str(),
                    name.c_str(), e.Message().c_str());
        return;
    }
}

int EcShaderObject::getAttribLocation(const char *)
{
    return -1;
}

void EcShaderObject::setupViewport(gfx::DisplayContext *pdc)
{
    const Vector4D &vp = pdc->getViewport();
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("setViewport").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::Number::New(env, vp.x()), Napi::Number::New(env, vp.y()),
                           Napi::Number::New(env, vp.z()), Napi::Number::New(env, vp.w())});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::setupViewport failed: %s", e.Message().c_str());
    }
}

void EcShaderObject::updateMatricesUBO(const void *data, size_t size)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto buf = createBuffer(env, data, size);
    auto method = peer.Get("updateMatricesUBO").As<Napi::Function>();
    try {
        method.Call(peer, {buf});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::updateMatricesUBO failed: %s", e.Message().c_str());
    }
}

void EcShaderObject::updateFogUBO(const void *data, size_t size)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto buf = createBuffer(env, data, size);
    auto method = peer.Get("updateFogUBO").As<Napi::Function>();
    try {
        method.Call(peer, {buf});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::updateFogUBO failed: %s", e.Message().c_str());
    }
}

void EcShaderObject::initDrawParamsUBO(size_t size)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto method = peer.Get("initDrawParamsUBO").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()),
                           Napi::Number::New(env, (double)size)});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::initDrawParamsUBO failed: %s", e.Message().c_str());
    }
}

void EcShaderObject::updateDrawParamsUBO(const void *data, size_t size)
{
    auto peer = m_pView->getPeerObj();
    auto env = peer.Env();
    auto buf = createBuffer(env, data, size);
    auto method = peer.Get("updateDrawParamsUBO").As<Napi::Function>();
    try {
        method.Call(peer, {Napi::String::New(env, getName().c_str()), buf});
    } catch (const Napi::Error &e) {
        MB_DPRINTLN("EcShaderObject::updateDrawParamsUBO failed: %s", e.Message().c_str());
    }
}

// void EcShaderObject::destroy()
// {
//     auto peer = m_pView->getPeerObj();
//     auto env = peer.Env();
//     auto method = peer.Get("deleteShader").As<Napi::Function>();
//     method.Call(peer, {Napi::String::New(env, getName().c_str())});
// }

}  // namespace node_jsbr
