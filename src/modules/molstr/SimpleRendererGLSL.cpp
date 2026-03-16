// -*-Mode: C++;-*-
//
// Simple molecular renderer (stick model) using OpenGL SL
//

#include <common.h>

#ifdef USE_OPENGL

#include "SimpleRenderer.hpp"
#include "BondIterator.hpp"
#include "AtomIterator.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <sysdep/ogl_core/GLSLLineHelper2.hpp>

namespace molstr {
// using namespace molstr;
using gfx::ColorPtr;
using qlib::Vector4D;

void SimpleRenderer::display(DisplayContext *pdc)
{
    if (!isUseShader() || pdc->isFile() || !pdc->isDrawElemSupported()) {
        // Use display list
        super_t::display(pdc);
        return;
    }

    m_pGlslLine->initShader(pdc);

    if (!m_pGlslLine->isValid()) {
        renderVBO();
        if (!m_pGlslLine->isValid()) return;  // Error, Cannot draw anything (ignore)
    }

    preRender(pdc);

    m_pGlslLine->setLineWidth(m_lw);
    m_pGlslLine->draw(pdc);

    postRender(pdc);
}

void SimpleRenderer::renderVBO()
{
    quint32 i, j;
    quint32 nbons = 0, natoms = 0, nmbons = 0, nva = 0;
    MolCoordPtr pMol = getClientMol();

    // initialize the coloring scheme
    getColSchm()->start(pMol, this);
    pMol->getColSchm()->start(pMol, this);

    std::deque<int> isolated_atoms;

    {
        // build bond data structure/estimate VBO size

        std::set<int> bonded_atoms;
        BondIterator biter(pMol, getSelection());

        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            int aid1 = pMB->getAtom1();
            int aid2 = pMB->getAtom2();

            bonded_atoms.insert(aid1);
            bonded_atoms.insert(aid2);

            MolAtomPtr pA1 = pMol->getAtom(aid1);
            MolAtomPtr pA2 = pMol->getAtom(aid2);

            if (pA1.isnull() || pA2.isnull()) continue;  // skip invalid bonds

            int nBondType = pMB->getType();
            if (m_bValBond &&
                (nBondType == MolBond::DOUBLE || nBondType == MolBond::TRIPLE)) {
                ++nmbons;
            } else {
                ++nbons;
            }
        }

        m_sbonds.resize(nbons);
        m_mbonds.resize(nmbons);

        i = 0;
        j = 0;
        int iva = 0;
        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            int aid1 = pMB->getAtom1();
            int aid2 = pMB->getAtom2();

            MolAtomPtr pA1 = pMol->getAtom(aid1);
            MolAtomPtr pA2 = pMol->getAtom(aid2);

            if (pA1.isnull() || pA2.isnull()) continue;  // skip invalid bonds

            ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
            ColorPtr pcol2 = ColSchmHolder::getColor(pA2);

            int nBondType = pMB->getType();
            bool bSameCol = (pcol1->equals(*pcol2.get())) ? true : false;

            if (m_bValBond &&
                (nBondType == MolBond::DOUBLE || nBondType == MolBond::TRIPLE)) {
                Vector4D dvd = pMB->getDblBondDir(pMol);

                m_mbonds[j].aid1 = aid1;
                m_mbonds[j].aid2 = aid2;
                m_mbonds[j].vaind = iva;
                m_mbonds[j].nx = (qfloat32)dvd.x();
                m_mbonds[j].ny = (qfloat32)dvd.y();
                m_mbonds[j].nz = (qfloat32)dvd.z();

                if (nBondType == MolBond::DOUBLE) {
                    // double bond
                    if (bSameCol) {
                        // same color --> one double bond
                        iva += 2 * 2;
                        m_mbonds[j].itype = IBON_1C_2V;
                        m_mbonds[j].nelems = 2 * 2;
                    } else {
                        // different color --> two double bonds
                        iva += 4 * 2;
                        m_mbonds[j].itype = IBON_2C_2V;
                        m_mbonds[j].nelems = 4 * 2;
                    }
                } else {
                    // triple bond
                    if (bSameCol) {
                        // same color --> one triple bond
                        iva += 2 * 3;
                        m_mbonds[j].itype = IBON_1C_3V;
                        m_mbonds[j].nelems = 2 * 3;
                    } else {
                        // different color --> two triple bonds
                        iva += 4 * 3;
                        m_mbonds[j].itype = IBON_2C_3V;
                        m_mbonds[j].nelems = 4 * 3;
                    }
                }
                ++j;
            } else {
                // single bond / valbond disabled
                m_sbonds[i].aid1 = aid1;
                m_sbonds[i].aid2 = aid2;
                m_sbonds[i].vaind = iva;

                if (bSameCol) {
                    // same color --> one bond
                    iva += 2;
                    m_sbonds[i].itype = IBON_1C_1V;
                    m_sbonds[i].nelems = 2;
                } else {
                    // different color --> two bonds
                    iva += 4;
                    m_sbonds[i].itype = IBON_2C_1V;
                    m_sbonds[i].nelems = 4;
                }
                ++i;
            }
        }

        // calculate isolated atoms
        AtomIterator aiter(pMol, getSelection());
        for (aiter.first(); aiter.hasMore(); aiter.next()) {
            int aid = aiter.getID();
            MolAtomPtr pAtom = pMol->getAtom(aid);
            if (pAtom.isnull()) continue;  // ignore errors
            if (bonded_atoms.find(aid) != bonded_atoms.end())
                continue;  // already bonded
            isolated_atoms.push_back(aid);
        }
        natoms = isolated_atoms.size();
        m_atoms.resize(natoms);
        for (i = 0; i < natoms; ++i) {
            m_atoms[i].aid1 = isolated_atoms[i];
            m_atoms[i].vaind = iva;
            iva += 2 * 3;
        }

        nva = iva;
    }

    getColSchm()->end();
    pMol->getColSchm()->end();

    /////

    m_pGlslLine->invalidate();
    m_pGlslLine->alloc(nva);

    /////

    MB_DPRINTLN("SimpleRenderer> %d elems VBO created", nva);
    updateVBO(true);
}

void SimpleRenderer::updateVBO(bool bUpdateColor)
{
    quint32 j = 0;
    quint32 i;
    quint32 nbons = m_sbonds.size();
    quint32 nmbons = m_mbonds.size();
    quint32 natoms = m_atoms.size();

    MolCoordPtr pMol = getClientMol();
    MolAtomPtr pA1, pA2;

    // ColorPtr pcol1, pcol2;
    quint32 cc1, cc2;
    Vector4D midpos, pos1, pos2;
    quint32 aid1, aid2;

    auto &data = *m_pGlslLine;

    // Single bonds
    for (i = 0; i < nbons; ++i) {
        aid1 = m_sbonds[i].aid1;
        aid2 = m_sbonds[i].aid2;
        j = m_sbonds[i].vaind;

        pA1 = pMol->getAtom(aid1);
        pA2 = pMol->getAtom(aid2);

        pos1 = pA1->getPos();
        pos2 = pA2->getPos();

        switch (m_sbonds[i].itype) {
            case IBON_1C_1V:
                data.vertex(j, pos1);
                ++j;
                data.vertex(j, pos2);
                ++j;
                break;

            case IBON_2C_1V: {
                midpos = (pos1 + pos2).divide(2.0);
                data.vertex(j, pos1);
                ++j;
                data.vertex(j, midpos);
                ++j;
                data.vertex(j, pos2);
                ++j;
                data.vertex(j, midpos);
                ++j;
                break;
            }

            default:
                break;
        }
    }

    // Double/triple bonds
    for (i = 0; i < nmbons; ++i) {
        aid1 = m_mbonds[i].aid1;
        aid2 = m_mbonds[i].aid2;
        j = m_mbonds[i].vaind;

        pA1 = pMol->getAtom(aid1);
        pA2 = pMol->getAtom(aid2);

        pos1 = pA1->getPos();
        pos2 = pA2->getPos();
        Vector4D dvd(m_mbonds[i].nx, m_mbonds[i].ny, m_mbonds[i].nz);

        switch (m_mbonds[i].itype) {
            case IBON_1C_2V: {
                data.vertex(j, pos1 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos2 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos1 + dvd.scale(m_dCvScl2));
                ++j;
                data.vertex(j, pos2 + dvd.scale(m_dCvScl2));
                ++j;
                break;
            }
            case IBON_2C_2V: {
                midpos = (pos1 + pos2).divide(2.0);

                data.vertex(j, pos1 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos1 + dvd.scale(m_dCvScl2));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl2));
                ++j;

                data.vertex(j, pos2 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos2 + dvd.scale(m_dCvScl2));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl2));
                ++j;

                break;
            }

            case IBON_1C_3V: {
                data.vertex(j, pos1);
                ++j;
                data.vertex(j, pos2);
                ++j;
                data.vertex(j, pos1 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos2 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos1 + dvd.scale(-m_dCvScl1));
                ++j;
                data.vertex(j, pos2 + dvd.scale(-m_dCvScl1));
                ++j;
                break;
            }
            case IBON_2C_3V: {
                midpos = (pos1 + pos2).divide(2.0);

                data.vertex(j, pos1);
                ++j;
                data.vertex(j, midpos);
                ++j;
                data.vertex(j, pos1 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos1 + dvd.scale(-m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(-m_dCvScl1));
                ++j;

                data.vertex(j, pos2);
                ++j;
                data.vertex(j, midpos);
                ++j;
                data.vertex(j, pos2 + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(m_dCvScl1));
                ++j;
                data.vertex(j, pos2 + dvd.scale(-m_dCvScl1));
                ++j;
                data.vertex(j, midpos + dvd.scale(-m_dCvScl1));
                ++j;

                break;
            }
            default:
                break;
        }
    }

    // Isolated atoms

    // size of the star
    const double rad = 0.25;
    const Vector4D xdel(rad, 0, 0);
    const Vector4D ydel(0, rad, 0);
    const Vector4D zdel(0, 0, rad);

    for (i = 0; i < natoms; ++i) {
        quint32 aid1 = m_atoms[i].aid1;
        quint32 j = m_atoms[i].vaind;

        MolAtomPtr pA1 = pMol->getAtom(aid1);
        Vector4D pos1 = pA1->getPos();

        data.vertex(j, pos1 - xdel);
        ++j;
        data.vertex(j, pos1 + xdel);
        ++j;
        data.vertex(j, pos1 - ydel);
        ++j;
        data.vertex(j, pos1 + ydel);
        ++j;
        data.vertex(j, pos1 - zdel);
        ++j;
        data.vertex(j, pos1 + zdel);
        ++j;
    }

    if (bUpdateColor) {
        // single bond colors
        for (i = 0; i < nbons; ++i) {
            aid1 = m_sbonds[i].aid1;
            aid2 = m_sbonds[i].aid2;
            j = m_sbonds[i].vaind;

            pA1 = pMol->getAtom(aid1);
            cc1 = ColSchmHolder::getColor(pA1)->getCode();

            data.color(j, cc1);
            ++j;
            data.color(j, cc1);
            ++j;

            if (m_sbonds[i].itype == IBON_2C_1V) {
                pA2 = pMol->getAtom(aid2);
                cc2 = ColSchmHolder::getColor(pA2)->getCode();
                data.color(j, cc2);
                ++j;
                data.color(j, cc2);
                ++j;
            }
        }

        // Double/triple bond colors
        for (i = 0; i < nmbons; ++i) {
            aid1 = m_mbonds[i].aid1;
            aid2 = m_mbonds[i].aid2;
            j = m_mbonds[i].vaind;

            pA1 = pMol->getAtom(aid1);
            cc1 = ColSchmHolder::getColor(pA1)->getCode();

            switch (m_mbonds[i].itype) {
                case IBON_1C_2V: {
                    for (int k = 0; k < 4; ++k, ++j) data.color(j, cc1);
                    break;
                }
                case IBON_2C_2V: {
                    pA2 = pMol->getAtom(aid2);
                    cc2 = ColSchmHolder::getColor(pA2)->getCode();
                    for (int k = 0; k < 4; ++k, ++j) data.color(j, cc1);
                    for (int k = 0; k < 4; ++k, ++j) data.color(j, cc2);
                    break;
                }

                case IBON_1C_3V: {
                    for (int k = 0; k < 6; ++k, ++j) data.color(j, cc1);
                    break;
                }
                case IBON_2C_3V: {
                    pA2 = pMol->getAtom(aid2);
                    cc2 = ColSchmHolder::getColor(pA2)->getCode();

                    for (int k = 0; k < 6; ++k, ++j) data.color(j, cc1);
                    for (int k = 0; k < 6; ++k, ++j) data.color(j, cc2);
                    break;
                }
                default:
                    break;
            }
        }

        // atom colors
        for (i = 0; i < natoms; ++i) {
            aid1 = m_atoms[i].aid1;
            j = m_atoms[i].vaind;

            pA1 = pMol->getAtom(aid1);
            cc1 = ColSchmHolder::getColor(pA1)->getCode();

            for (int k = 0; k < 6; ++k, ++j) data.color(j, cc1);
        }
    }
}

void SimpleRenderer::invalidateDisplayCache()
{
    if (m_pGlslLine->isValid()) {
        m_pGlslLine->invalidate();
        m_sbonds.clear();
        m_mbonds.clear();
        m_atoms.clear();
    }

    // super_t::invalidateDisplayCache();
}

void SimpleRenderer::objectChanged(qsys::ObjectEvent &ev)
{
    if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED) {
        if (ev.getDescr().equals("atomsMoved")) {
            // OBE_CHANGED && descr=="atomsMoved"
            if (m_pGlslLine->isValid()) {
                // only update positions
                updateVBO(false);
                // m_pVBO->setUpdated(true);
                m_pGlslLine->getDrawElem()->setUpdated(true);
                return;
            }
        }
    }

    super_t::objectChanged(ev);
}

}  // namespace molstr

#endif
