// -*-Mode: C++;-*-
//
// Simple molecular renderer (stick model) using LineDrawObj2
//

#include <common.h>

#include "SimpleRenderer.hpp"
#include "BondIterator.hpp"
#include "AtomIterator.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <gfx/DrawObj2.hpp>

namespace molstr {

using gfx::ColorPtr;
using qlib::Vector4D;

void SimpleRenderer::display(DisplayContext *pdc)
{
    if (pdc->isFile()) {
        // File (non-OpenGL) rendering: use legacy display list path
        super_t::display(pdc);
        return;
    }

    if (!m_bCheckShaderOK) {
        m_bUseShader = m_slLine.init(pdc);
        if (m_bUseShader) MB_DPRINTLN("SimpleRenderer line shader OK");
        m_bCheckShaderOK = true;
    }

    if (m_bUseShader) {
        if (!m_slLine.isValid()) {
            renderShaderImpl();
            if (!m_slLine.isValid()) return;  // Error: cannot draw anything
        }
        preRender(pdc);
        auto lw = static_cast<float>(m_lw);
        m_slLine.setLineWidth(lw * pdc->getPixSclFac());
        m_slLine.draw(pdc);
        postRender(pdc);
    } else {
        // Shader not available: fall back to legacy rendering
        super_t::display(pdc);
    }
}

void SimpleRenderer::renderShaderImpl()
{
    MolCoordPtr pMol = getClientMol();
    if (pMol.isnull()) return;

    // Initialize the coloring scheme
    getColSchm()->start(pMol, this);
    pMol->getColSchm()->start(pMol, this);

    // Pass 1: count total line segments needed
    int nlines = 0;
    std::set<int> bonded_atoms;
    {
        BondIterator biter(pMol, getSelection());
        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            int aid1 = pMB->getAtom1();
            int aid2 = pMB->getAtom2();
            MolAtomPtr pA1 = pMol->getAtom(aid1);
            MolAtomPtr pA2 = pMol->getAtom(aid2);
            if (pA1.isnull() || pA2.isnull()) continue;

            bonded_atoms.insert(aid1);
            bonded_atoms.insert(aid2);

            bool bSameCol =
                ColSchmHolder::getColor(pA1)->equals(*ColSchmHolder::getColor(pA2));
            int nBondType = pMB->getType();

            if (m_bValBond &&
                (nBondType == MolBond::DOUBLE || nBondType == MolBond::TRIPLE)) {
                if (nBondType == MolBond::DOUBLE)
                    nlines += bSameCol ? 2 : 4;
                else  // TRIPLE
                    nlines += bSameCol ? 3 : 6;
            } else {
                nlines += bSameCol ? 1 : 2;
            }
        }
    }

    // Collect isolated atoms and count their lines (3 per atom: x/y/z axes)
    std::vector<int> iso_atoms;
    {
        AtomIterator aiter(pMol, getSelection());
        for (aiter.first(); aiter.hasMore(); aiter.next()) {
            int aid = aiter.getID();
            MolAtomPtr pAtom = pMol->getAtom(aid);
            if (pAtom.isnull()) continue;
            if (bonded_atoms.find(aid) == bonded_atoms.end()) {
                iso_atoms.push_back(aid);
                nlines += 3;
            }
        }
    }

    if (nlines == 0) {
        getColSchm()->end();
        pMol->getColSchm()->end();
        return;
    }

    m_slLine.alloc(nlines);

    // Pass 2: fill line segment data
    int iline = 0;
    {
        BondIterator biter(pMol, getSelection());
        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            int aid1 = pMB->getAtom1();
            int aid2 = pMB->getAtom2();
            MolAtomPtr pA1 = pMol->getAtom(aid1);
            MolAtomPtr pA2 = pMol->getAtom(aid2);
            if (pA1.isnull() || pA2.isnull()) continue;

            const Vector4D pos1 = pA1->getPos();
            const Vector4D pos2 = pA2->getPos();
            ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
            ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
            quint32 cc1 = pcol1->getDevCode(getSceneID());
            quint32 cc2 = pcol2->getDevCode(getSceneID());
            bool bSameCol = pcol1->equals(*pcol2);

            int nBondType = pMB->getType();
            if (m_bValBond &&
                (nBondType == MolBond::DOUBLE || nBondType == MolBond::TRIPLE)) {
                Vector4D dvd = pMB->getDblBondDir(pMol);

                if (nBondType == MolBond::DOUBLE) {
                    if (bSameCol) {
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         pos2 + dvd.scale(m_dCvScl1), cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl2), cc1,
                                         pos2 + dvd.scale(m_dCvScl2), cc1);
                    } else {
                        const Vector4D mid = (pos1 + pos2).divide(2.0);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         mid + dvd.scale(m_dCvScl1), cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl2), cc1,
                                         mid + dvd.scale(m_dCvScl2), cc1);
                        m_slLine.setLine(iline++, pos2 + dvd.scale(m_dCvScl1), cc2,
                                         mid + dvd.scale(m_dCvScl1), cc2);
                        m_slLine.setLine(iline++, pos2 + dvd.scale(m_dCvScl2), cc2,
                                         mid + dvd.scale(m_dCvScl2), cc2);
                    }
                } else {
                    // TRIPLE bond
                    if (bSameCol) {
                        m_slLine.setLine(iline++, pos1, cc1, pos2, cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         pos2 + dvd.scale(m_dCvScl1), cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(-m_dCvScl1), cc1,
                                         pos2 + dvd.scale(-m_dCvScl1), cc1);
                    } else {
                        const Vector4D mid = (pos1 + pos2).divide(2.0);
                        m_slLine.setLine(iline++, pos1, cc1, mid, cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         mid + dvd.scale(m_dCvScl1), cc1);
                        m_slLine.setLine(iline++, pos1 + dvd.scale(-m_dCvScl1), cc1,
                                         mid + dvd.scale(-m_dCvScl1), cc1);
                        m_slLine.setLine(iline++, pos2, cc2, mid, cc2);
                        m_slLine.setLine(iline++, pos2 + dvd.scale(m_dCvScl1), cc2,
                                         mid + dvd.scale(m_dCvScl1), cc2);
                        m_slLine.setLine(iline++, pos2 + dvd.scale(-m_dCvScl1), cc2,
                                         mid + dvd.scale(-m_dCvScl1), cc2);
                    }
                }
            } else {
                // Single bond (or valence bond disabled)
                if (bSameCol) {
                    m_slLine.setLine(iline++, pos1, cc1, pos2, cc1);
                } else {
                    const Vector4D mid = (pos1 + pos2).divide(2.0);
                    m_slLine.setLine(iline++, pos1, cc1, mid, cc1);
                    m_slLine.setLine(iline++, pos2, cc2, mid, cc2);
                }
            }
        }
    }

    // Isolated atoms rendered as 3-axis asterisks
    const double rad = 0.25;
    const Vector4D xdel(rad, 0, 0);
    const Vector4D ydel(0, rad, 0);
    const Vector4D zdel(0, 0, rad);
    for (int aid : iso_atoms) {
        MolAtomPtr pAtom = pMol->getAtom(aid);
        if (pAtom.isnull()) continue;
        const Vector4D pos = pAtom->getPos();
        quint32 cc = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
        m_slLine.setLine(iline++, pos - xdel, cc, pos + xdel, cc);
        m_slLine.setLine(iline++, pos - ydel, cc, pos + ydel, cc);
        m_slLine.setLine(iline++, pos - zdel, cc, pos + zdel, cc);
    }

    // Finalize the coloring scheme
    getColSchm()->end();
    pMol->getColSchm()->end();

    LOG_DPRINTLN("SimpleRenderer> rendered %d line segments", nlines);
}

void SimpleRenderer::invalidateDisplayCache()
{
    super_t::invalidateDisplayCache();
    m_slLine.invalidate();
}

void SimpleRenderer::objectChanged(qsys::ObjectEvent &ev)
{
    if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED) {
        if (ev.getDescr().equals("atomsMoved")) {
            if (m_bUseShader) {
                // Invalidate shader cache so it is rebuilt on next display()
                m_slLine.invalidate();
                return;
            }
        }
    }
    super_t::objectChanged(ev);
}

}  // namespace molstr
