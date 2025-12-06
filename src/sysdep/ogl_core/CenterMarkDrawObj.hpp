// -*-Mode: C++;-*-

#pragma once

#include <sysdep/sysdep.hpp>

#include <qsys/DrawObj.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>

namespace gfx {
  class DrawObjSet;
}

namespace sysdep {

using gfx::DisplayContext;

class SYSDEP_API CenterMarkDrawObj : public qsys::DrawObj
{
    //  MC_SCRIPTABLE;

private:
    using super_t = qsys::DrawObj;

public:
    CenterMarkDrawObj();
    virtual ~CenterMarkDrawObj();

    virtual void display(DisplayContext *pdc);
    virtual void display2D(DisplayContext *pdc);

private:
    gfx::DrawObjSet *m_pdata;
    
    bool m_bInitOK;

    bool init(gfx::DisplayContext *pdc);
    

};

}  // namespace sysdep
