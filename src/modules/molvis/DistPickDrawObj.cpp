// -*-Mode: C++;-*-
//
//
//
// $Id: DistPickDrawObj.cpp,v 1.3 2010/12/03 17:47:08 rishitani Exp $

#include <common.h>
#include "DistPickDrawObj.hpp"

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

using namespace molvis;

DistPickDrawObj::DistPickDrawObj()
    : super_t(), m_color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0, 0.5))
{
    m_width = 4.0f;
}

DistPickDrawObj::~DistPickDrawObj() {}

bool DistPickDrawObj::init(DisplayContext* pdc)
{
    if (m_linePrim.isValid())
        return true;

    if (!m_linePrim.init(pdc))
        return false;

    // Drive the marker colour from the color property (ARGB, incl. alpha)
    // rather than a hardcoded literal. The wide-line GpuPrim unpacks this as
    // ARGB, so a raw literal here (formerly 0xFFFFFF80) silently lost the
    // intended alpha into the blue byte and rendered opaque.
    const qlib::quint32 ccode = m_color->getCode();

    m_linePrim.alloc(pdc, 3);
    const float dsize = 0.5f;

    m_linePrim.setNoDepth(true);
    m_linePrim.setLine(0, Vector4D(-dsize, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
    m_linePrim.setLine(1, Vector4D(0, -dsize, 0), ccode, Vector4D(0, dsize, 0), ccode);
    m_linePrim.setLine(2, Vector4D(0, 0, -dsize), ccode, Vector4D(0, 0, dsize), ccode);

    return true;
}

void DistPickDrawObj::display(DisplayContext* pdc, qsys::ViewPtr pView)
{
    if (!init(pdc))
        return;

    // Set the line width every frame, just before drawing. LineGpuPrim caches
    // the width in m_linew and only the value present at draw() time is
    // uploaded, so setting it once in init() is fragile. The viewport is in
    // device pixels, so scale by the pixel-scale factor for a DPI-independent
    // on-screen width.
    m_linePrim.setLineWidth(float(m_width) * float(pdc->getPixSclFac()));

    for (const auto& pos : m_data) {
        pdc->pushMatrix();
        pdc->translate(pos);
        m_linePrim.draw(pdc);
        pdc->popMatrix();
    }
}

void DistPickDrawObj::display2D(DisplayContext* pdc, qsys::ViewPtr pView) {}

void DistPickDrawObj::setEnabled(bool f)
{
    super_t::setEnabled(f);
    if (!f) m_data.clear();
}

void DistPickDrawObj::append(qlib::uid_t mol_id, int naid)
{
    MolCoordPtr pMol = qsys::SceneManager::getObjectS(mol_id);
    if (pMol.isnull()) return;
    molstr::MolAtomPtr pAtom = pMol->getAtom(naid);
    if (pAtom.isnull()) {
        LOG_DPRINTLN("DistPickDrawObj> atom %d not found in mol %d", naid, int(mol_id));
        return;
    }
    m_data.push_back(pAtom->getPos());
}
