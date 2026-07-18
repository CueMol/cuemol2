// -*-Mode: C++;-*-

#pragma once

#include "qsys.hpp"
#include "DrawObj.hpp"
#include <gfx/GpuPrim.hpp>

namespace qsys {

class QSYS_API CenterMarkDrawObj : public DrawObj
{
    using super_t = DrawObj;

    int m_nCenterMark;
    gfx::LineGpuPrim m_linePrim;

public:
    CenterMarkDrawObj();
    ~CenterMarkDrawObj() override = default;

    void display(gfx::DisplayContext *pdc, ViewPtr pView) override;
    void display2D(gfx::DisplayContext *pdc, ViewPtr pView) override;

    int getCenterMark() const { return m_nCenterMark; }
    void setCenterMark(int nMode);

private:
    bool initPrim(gfx::DisplayContext *pdc);
};

}  // namespace qsys
