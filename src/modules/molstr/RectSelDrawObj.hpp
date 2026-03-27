// -*-Mode: C++;-*-
//
// RectSelDrawObj: drawing object for distance picker UI
//

#pragma once

#include "molstr.hpp"

#include <qsys/DrawObj.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/GpuPrim.hpp>

class RectSelDrawObj_wrap;

namespace molstr {

using gfx::ColorPtr;
using gfx::DisplayContext;
using qlib::Vector4D;

class MOLSTR_API RectSelDrawObj : public qsys::DrawObj
{
    MC_SCRIPTABLE;

    friend class ::RectSelDrawObj_wrap;

private:
    typedef qsys::DrawObj super_t;

    ColorPtr m_color, m_colorPaint;

    int m_nStartX, m_nStartY;
    int m_nEndX, m_nEndY;
    // int m_nWidth, m_nHeight;

    bool m_bStart;

    gfx::LineGpuPrim m_linePrim;
    gfx::TrigGpuPrim m_trigPrim;

    bool init(DisplayContext *pdc);

public:
    RectSelDrawObj();
    virtual ~RectSelDrawObj();

    virtual void display(DisplayContext *pdc, qsys::ViewPtr pView);
    virtual void display2D(DisplayContext *pdc, qsys::ViewPtr pView);

    virtual void setEnabled(bool f);

    void start(int x, int y);
    void move(int x, int y);
    void end();

    int getLeft() const
    {
        return (m_nStartX < m_nEndX) ? m_nStartX : m_nEndX;
    }
    int getTop() const
    {
        return (m_nStartY < m_nEndY) ? m_nStartY : m_nEndY;
    }
    int getWidth() const
    {
        return qlib::abs(m_nStartX - m_nEndX);
    }
    int getHeight() const
    {
        return qlib::abs(m_nStartY - m_nEndY);
    }
};

}  // namespace molstr
