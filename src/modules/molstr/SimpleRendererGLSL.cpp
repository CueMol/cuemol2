// -*-Mode: C++;-*-
//
// Simple molecular renderer (stick model) using LineGpuPrim
//

#include <common.h>

#include "SimpleRenderer.hpp"
#include "BondIterator.hpp"
#include "AtomIterator.hpp"
#include "MolCoord.hpp"

#include <gfx/GpuPrim.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/FloatDataTexture.hpp>
#include <qsys/Scene.hpp>

namespace molstr {

using gfx::ColorPtr;
using qlib::Vector4D;

namespace {
// Fixed coordinate texture width (matches TEX2D_WIDTH in lib_atoms.glsl).
constexpr int TEX2D_WIDTH = 1024;
}  // namespace

void SimpleRenderer::display(DisplayContext *pdc)
{
    if (pdc->isFile()) {
        // File (non-OpenGL) rendering: use legacy display list path
        super_t::display(pdc);
        return;
    }

    if (!m_bCheckShaderOK) {
        // Prefer the coordinate-texture path (direct update). Fall back to the
        // plain wide-line shader if the coordinate-texture shader is missing.
        m_bUseCoordTex = m_lineValGpuPrim.init(pdc);
        if (m_bUseCoordTex) MB_DPRINTLN("SimpleRenderer coord-tex line shader OK");
        m_bCheckShaderOK = true;
    }

    if (m_bUseCoordTex) {
        if (!m_lineValGpuPrim.isValid()) {
            renderCoordTexImpl(pdc);
            // renderCoordTexImpl clears m_bUseCoordTex if the backend cannot
            // provide a float data texture.
        }
        if (m_bUseCoordTex && m_lineValGpuPrim.isValid()) {
            // Deferred coordinate upload: at most once per frame, inside the
            // rAF tick, right before the draw.
            if (m_bCoordDirty) {
                if (!updateCoordTex()) {
                    // Topology changed under us: fall back to a full rebuild.
                    invalidateDisplayCache();
                    return;
                }
                m_bCoordDirty = false;
            }
            preRender(pdc);
            m_lineValGpuPrim.setLineWidth(static_cast<float>(m_lw) *
                                          pdc->getPixSclFac());
            m_lineValGpuPrim.draw(pdc);
            postRender(pdc);
            return;
        }
        // Float texture unavailable: initialise the plain wide-line shader.
        if (!m_bUseShader && !m_lineGpuPrim.isValid())
            m_bUseShader = m_lineGpuPrim.init(pdc);
    }

    if (m_bUseShader) {
        if (!m_lineGpuPrim.isValid()) {
            renderShaderImpl(pdc);
            if (!m_lineGpuPrim.isValid()) return;  // Error: cannot draw anything
        }
        preRender(pdc);
        auto lw = static_cast<float>(m_lw);
        m_lineGpuPrim.setLineWidth(lw * pdc->getPixSclFac());
        m_lineGpuPrim.draw(pdc);
        postRender(pdc);
    } else {
        // Shader not available: fall back to legacy rendering
        super_t::display(pdc);
    }
}

void SimpleRenderer::renderShaderImpl(gfx::DisplayContext *pdc)
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

    m_lineGpuPrim.alloc(pdc, nlines);

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
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         pos2 + dvd.scale(m_dCvScl1), cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl2), cc1,
                                         pos2 + dvd.scale(m_dCvScl2), cc1);
                    } else {
                        const Vector4D mid = (pos1 + pos2).divide(2.0);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         mid + dvd.scale(m_dCvScl1), cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl2), cc1,
                                         mid + dvd.scale(m_dCvScl2), cc1);
                        m_lineGpuPrim.setLine(iline++, pos2 + dvd.scale(m_dCvScl1), cc2,
                                         mid + dvd.scale(m_dCvScl1), cc2);
                        m_lineGpuPrim.setLine(iline++, pos2 + dvd.scale(m_dCvScl2), cc2,
                                         mid + dvd.scale(m_dCvScl2), cc2);
                    }
                } else {
                    // TRIPLE bond
                    if (bSameCol) {
                        m_lineGpuPrim.setLine(iline++, pos1, cc1, pos2, cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         pos2 + dvd.scale(m_dCvScl1), cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(-m_dCvScl1), cc1,
                                         pos2 + dvd.scale(-m_dCvScl1), cc1);
                    } else {
                        const Vector4D mid = (pos1 + pos2).divide(2.0);
                        m_lineGpuPrim.setLine(iline++, pos1, cc1, mid, cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(m_dCvScl1), cc1,
                                         mid + dvd.scale(m_dCvScl1), cc1);
                        m_lineGpuPrim.setLine(iline++, pos1 + dvd.scale(-m_dCvScl1), cc1,
                                         mid + dvd.scale(-m_dCvScl1), cc1);
                        m_lineGpuPrim.setLine(iline++, pos2, cc2, mid, cc2);
                        m_lineGpuPrim.setLine(iline++, pos2 + dvd.scale(m_dCvScl1), cc2,
                                         mid + dvd.scale(m_dCvScl1), cc2);
                        m_lineGpuPrim.setLine(iline++, pos2 + dvd.scale(-m_dCvScl1), cc2,
                                         mid + dvd.scale(-m_dCvScl1), cc2);
                    }
                }
            } else {
                // Single bond (or valence bond disabled)
                if (bSameCol) {
                    m_lineGpuPrim.setLine(iline++, pos1, cc1, pos2, cc1);
                } else {
                    const Vector4D mid = (pos1 + pos2).divide(2.0);
                    m_lineGpuPrim.setLine(iline++, pos1, cc1, mid, cc1);
                    m_lineGpuPrim.setLine(iline++, pos2, cc2, mid, cc2);
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
        m_lineGpuPrim.setLine(iline++, pos - xdel, cc, pos + xdel, cc);
        m_lineGpuPrim.setLine(iline++, pos - ydel, cc, pos + ydel, cc);
        m_lineGpuPrim.setLine(iline++, pos - zdel, cc, pos + zdel, cc);
    }

    // Finalize the coloring scheme
    getColSchm()->end();
    pMol->getColSchm()->end();

    LOG_DPRINTLN("SimpleRenderer> rendered %d line segments", nlines);
}

void SimpleRenderer::renderCoordTexImpl(gfx::DisplayContext *pdc)
{
    MolCoordPtr pMol = getClientMol();
    if (pMol.isnull()) return;

    // Initialize the coloring scheme
    getColSchm()->start(pMol, this);
    pMol->getColSchm()->start(pMol, this);

    // Build the atom texel layout (all selected atoms) + AID -> index map.
    m_aidcache.clear();
    m_aid2idx.clear();
    {
        AtomIterator aiter(pMol, getSelection());
        int i = 0;
        for (aiter.first(); aiter.hasMore(); aiter.next()) {
            int aid = aiter.getID();
            MolAtomPtr pAtom = pMol->getAtom(aid);
            if (pAtom.isnull()) continue;
            m_aidcache.push_back(aid);
            m_aid2idx[aid] = i;
            ++i;
        }
    }
    const int natoms = static_cast<int>(m_aidcache.size());
    if (natoms == 0) {
        getColSchm()->end();
        pMol->getColSchm()->end();
        return;
    }

    // Pass 1: count total line segments (bonds + isolated-atom asters).
    int nlines = 0;
    std::set<int> bonded_atoms;
    {
        BondIterator biter(pMol, getSelection());
        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            int aid1 = pMB->getAtom1();
            int aid2 = pMB->getAtom2();
            if (m_aid2idx.find(aid1) == m_aid2idx.end() ||
                m_aid2idx.find(aid2) == m_aid2idx.end())
                continue;
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

    std::vector<int> iso_atoms;
    for (int aid : m_aidcache) {
        if (bonded_atoms.find(aid) == bonded_atoms.end()) {
            iso_atoms.push_back(aid);
            nlines += 3;
        }
    }

    if (nlines == 0) {
        getColSchm()->end();
        pMol->getColSchm()->end();
        return;
    }

    // Allocate the coordinate texture (RGB32F, one texel per atom, width 1024).
    m_nTexW = TEX2D_WIDTH;
    m_nTexH = (natoms + TEX2D_WIDTH - 1) / TEX2D_WIDTH;
    m_coordbuf.resize(static_cast<size_t>(m_nTexW) * m_nTexH * 3);

    m_pCoordTex = pdc->createFloatDataTexture();
    if (m_pCoordTex == nullptr || !m_pCoordTex->create(m_nTexW, m_nTexH, 3)) {
        if (m_pCoordTex != nullptr) {
            delete m_pCoordTex;
            m_pCoordTex = nullptr;
        }
        m_bUseCoordTex = false;
        m_aidcache.clear();
        m_aid2idx.clear();
        m_coordbuf.clear();
        getColSchm()->end();
        pMol->getColSchm()->end();
        return;
    }

    // Write atom positions into the staging buffer.
    for (int i = 0; i < natoms; ++i) {
        MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
        const Vector4D pos = pAtom->getPos();
        m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
        m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
        m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
    }

    m_lineValGpuPrim.alloc(pdc, nlines);

    // Pass 2: fill line segment data.
    int iline = 0;
    {
        BondIterator biter(pMol, getSelection());
        for (biter.first(); biter.hasMore(); biter.next()) {
            MolBond *pMB = biter.getBond();
            auto it1 = m_aid2idx.find(pMB->getAtom1());
            auto it2 = m_aid2idx.find(pMB->getAtom2());
            if (it1 == m_aid2idx.end() || it2 == m_aid2idx.end()) continue;
            MolAtomPtr pA1 = pMol->getAtom(pMB->getAtom1());
            MolAtomPtr pA2 = pMol->getAtom(pMB->getAtom2());
            if (pA1.isnull() || pA2.isnull()) continue;

            const int idx1 = it1->second;
            const int idx2 = it2->second;
            ColorPtr pcol1 = ColSchmHolder::getColor(pA1);
            ColorPtr pcol2 = ColSchmHolder::getColor(pA2);
            quint32 cc1 = pcol1->getDevCode(getSceneID());
            quint32 cc2 = pcol2->getDevCode(getSceneID());
            bool bSameCol = pcol1->equals(*pcol2);

            int nBondType = pMB->getType();
            if (m_bValBond &&
                (nBondType == MolBond::DOUBLE || nBondType == MolBond::TRIPLE)) {
                // Reference atom for the perpendicular displacement direction.
                // -1 -> the shader uses a view-facing fallback.
                int idxd = -1;
                int refAid = pMB->getDblBondRefAtom(pMol);
                if (refAid >= 0) {
                    auto itd = m_aid2idx.find(refAid);
                    if (itd != m_aid2idx.end()) idxd = itd->second;
                }
                const float s1 = static_cast<float>(m_dCvScl1);
                const float s2 = static_cast<float>(m_dCvScl2);

                if (nBondType == MolBond::DOUBLE) {
                    if (bSameCol) {
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 1.0f, s1, idxd, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 1.0f, s2, idxd, cc1, cc1);
                    } else {
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 0.5f, s1, idxd, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 0.5f, s2, idxd, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 1.0f, 0.5f, s1, idxd, cc2, cc2);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 1.0f, 0.5f, s2, idxd, cc2, cc2);
                    }
                } else {
                    // TRIPLE bond: central line + two displaced (+-s1).
                    if (bSameCol) {
                        m_lineValGpuPrim.setLine(iline++, idx1, idx2, 0.0f, 1.0f, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 1.0f, s1, idxd, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 1.0f, -s1, idxd, cc1, cc1);
                    } else {
                        m_lineValGpuPrim.setLine(iline++, idx1, idx2, 0.0f, 0.5f, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 0.5f, s1, idxd, cc1, cc1);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 0.0f, 0.5f, -s1, idxd, cc1, cc1);
                        m_lineValGpuPrim.setLine(iline++, idx1, idx2, 1.0f, 0.5f, cc2, cc2);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 1.0f, 0.5f, s1, idxd, cc2, cc2);
                        m_lineValGpuPrim.setValLine(iline++, idx1, idx2, 1.0f, 0.5f, -s1, idxd, cc2, cc2);
                    }
                }
            } else {
                // Single bond (or valence bond disabled)
                if (bSameCol) {
                    m_lineValGpuPrim.setLine(iline++, idx1, idx2, 0.0f, 1.0f, cc1, cc1);
                } else {
                    m_lineValGpuPrim.setLine(iline++, idx1, idx2, 0.0f, 0.5f, cc1, cc1);
                    m_lineValGpuPrim.setLine(iline++, idx1, idx2, 1.0f, 0.5f, cc2, cc2);
                }
            }
        }
    }

    // Isolated atoms rendered as 3-axis asters.
    const double rad = 0.25;
    const Vector4D xdel(rad, 0, 0), ydel(0, rad, 0), zdel(0, 0, rad);
    const Vector4D nxdel = xdel.scale(-1.0), nydel = ydel.scale(-1.0),
                   nzdel = zdel.scale(-1.0);
    for (int aid : iso_atoms) {
        auto it = m_aid2idx.find(aid);
        if (it == m_aid2idx.end()) continue;
        const int idx = it->second;
        MolAtomPtr pAtom = pMol->getAtom(aid);
        if (pAtom.isnull()) continue;
        quint32 cc = ColSchmHolder::getColor(pAtom)->getDevCode(getSceneID());
        m_lineValGpuPrim.setAster(iline++, idx, nxdel, xdel, cc);
        m_lineValGpuPrim.setAster(iline++, idx, nydel, ydel, cc);
        m_lineValGpuPrim.setAster(iline++, idx, nzdel, zdel, cc);
    }

    m_pCoordTex->update(&m_coordbuf[0]);
    m_lineValGpuPrim.setCoordTex(m_pCoordTex, 0);
    m_bCoordDirty = false;

    // Finalize the coloring scheme
    getColSchm()->end();
    pMol->getColSchm()->end();

    LOG_DPRINTLN("SimpleRenderer> rendered %d line segments (coord texture %dx%d)",
                 nlines, m_nTexW, m_nTexH);
}

bool SimpleRenderer::updateCoordTex()
{
    if (!m_bUseCoordTex || m_pCoordTex == nullptr) return false;
    if (m_aidcache.empty()) return false;

    MolCoordPtr pMol = getClientMol();
    if (pMol.isnull()) return false;

    const int natoms = static_cast<int>(m_aidcache.size());
    for (int i = 0; i < natoms; ++i) {
        MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
        if (pAtom.isnull()) return false;  // topology changed; force rebuild
        const Vector4D pos = pAtom->getPos();
        m_coordbuf[i * 3 + 0] = static_cast<qfloat32>(pos.x());
        m_coordbuf[i * 3 + 1] = static_cast<qfloat32>(pos.y());
        m_coordbuf[i * 3 + 2] = static_cast<qfloat32>(pos.z());
    }
    m_pCoordTex->update(&m_coordbuf[0]);
    return true;
}

void SimpleRenderer::invalidateDisplayCache()
{
    super_t::invalidateDisplayCache();
    m_lineValGpuPrim.invalidate();
    m_lineGpuPrim.invalidate();
    if (m_pCoordTex != nullptr) {
        delete m_pCoordTex;
        m_pCoordTex = nullptr;
    }
    m_aidcache.clear();
    m_aid2idx.clear();
    m_coordbuf.clear();
    m_bCoordDirty = false;
}

void SimpleRenderer::objectChanged(qsys::ObjectEvent &ev)
{
    if (ev.getType() == qsys::ObjectEvent::OBE_CHANGED) {
        if (ev.getDescr().equals("atomsMoved")) {
            if (m_bUseCoordTex && m_lineValGpuPrim.isValid()) {
                // Positions changed but topology did not. Mark the coordinate
                // texture dirty and let display() upload it (once per frame,
                // inside the rAF tick). No GL calls here.
                m_bCoordDirty = true;
                qsys::ScenePtr pScene = getScene();
                if (!pScene.isnull()) pScene->setUpdateFlag();
                invalidateHittestCache();
                return;
            }
            if (m_bUseShader) {
                // Fallback path: invalidate shader cache so it is rebuilt on
                // the next display().
                m_lineGpuPrim.invalidate();
                invalidateHittestCache();
                return;
            }
        }
    }
    super_t::objectChanged(ev);
}

}  // namespace molstr
