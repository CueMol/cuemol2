// -*-Mode: C++;-*-
//
// OcView.hpp
// View class for OpenGL core profile
//

#pragma once

#include <sysdep/sysdep.hpp>

#include <qsys/qsys.hpp>
#include <qsys/GUIView.hpp>
#include <gfx/Hittest.hpp>

namespace sysdep {

class SYSDEP_API OcView : public qsys::GUIView
{
protected:
    bool m_bInitOK;

    /// default VAO of the core-profile context (released in unloading());
    /// GLuint is unsigned int, and the GL headers are not visible here on
    /// every platform
    unsigned int m_nDefaultVAO = 0;

public:
    using super_t = qsys::GUIView;

    OcView();

    OcView(const OcView &r);

    ~OcView() override;

    //////////

public:
    LString toString() const override;

    void setup();

    void unloading() override;

    ////////////////////////////////////////////////
    // implementation

    void setUseGlShader(bool f)
    {
    }

};

}  // namespace sysdep
