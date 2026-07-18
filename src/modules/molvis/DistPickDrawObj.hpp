// -*-Mode: C++;-*-
//
// DistPickDrawObj: drawing object for distance picker UI
//

#pragma once

#include "molvis.hpp"

#include <modules/molstr/molstr.hpp>
#include <qsys/DrawObj.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/GpuPrim.hpp>

class DistPickDrawObj_wrap;

namespace molvis {

using gfx::ColorPtr;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using qlib::Vector4D;

class MOLVIS_API DistPickDrawObj : public qsys::DrawObj
{
    MC_SCRIPTABLE;

    friend class ::DistPickDrawObj_wrap;

private:
    typedef qsys::DrawObj super_t;
    typedef std::deque<Vector4D> data_t;
    data_t m_data;

    ColorPtr m_color;

    double m_width;

    gfx::LineGpuPrim m_linePrim;

    bool init(gfx::DisplayContext *pdc);
public:
    DistPickDrawObj();
    ~DistPickDrawObj() override;

    void display(DisplayContext *pdc, qsys::ViewPtr pView) override;
    void display2D(DisplayContext *pdc, qsys::ViewPtr pView) override;

    void setEnabled(bool f) override;

    void append(qlib::uid_t mol_id, int naid);
};

}  // namespace molvis

