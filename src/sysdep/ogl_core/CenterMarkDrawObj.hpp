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

    virtual void display(DisplayContext *pdc);
    virtual void display2D(DisplayContext *pdc);

    int getCenterMark() const
    {
        return m_nCenterMark;
    }

    void setCenterMark(int nMode)
    {
        if (m_nCenterMark != nMode && m_pdata != nullptr) {
            m_nCenterMark = nMode;
            delete m_pdata;
            m_pdata = nullptr;
        }
    }

private:
    gfx::DrawObjSet *m_pdata;

    bool init(gfx::DisplayContext *pdc);
};

}  // namespace sysdep
