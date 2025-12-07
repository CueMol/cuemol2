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
#include <gfx/DrawObjElems.hpp>

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

    gfx::DrawObjSet *m_pdata;

    bool init(gfx::DisplayContext *pdc);
public:
    DistPickDrawObj();
    virtual ~DistPickDrawObj();

    virtual void display(DisplayContext *pdc, qsys::ViewPtr pView);
    virtual void display2D(DisplayContext *pdc, qsys::ViewPtr pView);

    virtual void setEnabled(bool f);

    void append(qlib::uid_t mol_id, int naid);
};

}  // namespace molvis

