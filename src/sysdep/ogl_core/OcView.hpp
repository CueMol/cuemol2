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

public:
    using super_t = qsys::GUIView;

    OcView();

    OcView(const OcView &r);

    virtual ~OcView();

    //////////

public:
    virtual LString toString() const;

    void setup();

    virtual void setCenterMark(int nMode);

    ////////////////////////////////////////////////
    // implementation

    void setUseGlShader(bool f)
    {
    }

};

}  // namespace sysdep
