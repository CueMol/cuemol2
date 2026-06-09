// -*-Mode: C++;-*-
//
// WebGL (tritium) view capability info
//

#pragma once

#include <qsys/ViewCap.hpp>

namespace node_jsbr {

/// View capability stub for the WebGL2 (tritium) backend.
///
/// Unlike the desktop OcViewCap, the constructor performs NO GL calls
/// (glGetString etc.): the capability flags are static and the WebGL context
/// lives on the JS side. Only hasFBO() is reported true, which opens the
/// off-screen AO/AA pipeline gate in GUIView::drawScene. The remaining flags
/// stay false to match the current effective behavior (tritium renders today
/// with a null ViewCap, i.e. all-false): the only path that branches on
/// hasVBO()/hasVertShader() is ShaderSetupHelper, which the post-process
/// shaders do not go through, so keeping them false fixes the rendering path.
class ElecViewCap : public qsys::ViewCap
{
public:
    ElecViewCap() {}
    virtual ~ElecViewCap() {}

    /// framebuffer object (off-screen render targets) -- enables the AO path.
    virtual bool hasFBO() const override
    {
        return true;
    }
};

}  // namespace node_jsbr
