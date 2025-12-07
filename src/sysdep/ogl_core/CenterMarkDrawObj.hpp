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

    int m_nCenterMark;

public:
    CenterMarkDrawObj();
    virtual ~CenterMarkDrawObj();

    virtual void display(DisplayContext *pdc, qsys::ViewPtr pView);
    virtual void display2D(DisplayContext *pdc, qsys::ViewPtr pView);

    int getCenterMark() const
    {
        return m_nCenterMark;
    }

    void setCenterMark(int nMode);

private:
    gfx::DrawObjSet *m_pdata;

    bool init(gfx::DisplayContext *pdc);
};

}  // namespace sysdep
