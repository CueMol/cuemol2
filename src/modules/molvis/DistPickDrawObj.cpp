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
    : super_t(), m_color(gfx::SolidColor::createRGB(1.0, 1.0, 1.0))
{
    m_width = 2.0f;
}

DistPickDrawObj::~DistPickDrawObj() {}

bool DistPickDrawObj::init(DisplayContext* pdc)
{
    if (m_linePrim.isValid())
        return true;

    if (!m_linePrim.init(pdc))
        return false;

    const qlib::quint32 ccode = 0xFFFFFF80;  // White color

    m_linePrim.alloc(pdc, 3);
    const float dsize = 0.25f;

    m_linePrim.setLineWidth(m_width);
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
    m_data.push_back(pAtom->getPos());
}
