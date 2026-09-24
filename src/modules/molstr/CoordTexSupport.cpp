// -*-Mode: C++;-*-
//
// Coordinate-texture support for molecular renderers
//

#include <common.h>

#include "CoordTexSupport.hpp"

#include "AnimMol.hpp"
#include "MolAtom.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/FloatDataTexture.hpp>

using namespace molstr;

CoordTexSupport::CoordTexSupport()
    : m_pCoordTex(NULL),
      m_nTexW(0),
      m_nTexH(0),
      m_bUseCoordTex(true),
      m_bCoordDirty(false),
      m_bNothingToDraw(false)
{
}

CoordTexSupport::~CoordTexSupport()
{
    if (m_pCoordTex != NULL) delete m_pCoordTex;
}

void CoordTexSupport::ctBegin()
{
    m_aidcache.clear();
    m_aid2idx.clear();
    m_crdidx.clear();
    m_bNothingToDraw = false;
}

int CoordTexSupport::ctAddAtom(int aid)
{
    std::unordered_map<int, int>::const_iterator i = m_aid2idx.find(aid);
    if (i != m_aid2idx.end()) return i->second;

    const int idx = static_cast<int>(m_aidcache.size());
    m_aidcache.push_back(aid);
    m_aid2idx[aid] = idx;
    return idx;
}

int CoordTexSupport::ctIndexOf(int aid) const
{
    std::unordered_map<int, int>::const_iterator i = m_aid2idx.find(aid);
    return (i == m_aid2idx.end()) ? -1 : i->second;
}

void CoordTexSupport::ctInvalidate()
{
    if (m_pCoordTex != NULL) {
        delete m_pCoordTex;
        m_pCoordTex = NULL;
    }
    m_aidcache.clear();
    m_aid2idx.clear();
    m_crdidx.clear();
    m_coordbuf.clear();
    m_nTexW = m_nTexH = 0;
    m_bCoordDirty = false;
    m_bNothingToDraw = false;
}

void CoordTexSupport::ctResolveCrdIndices(const MolCoordPtr &pMol)
{
    m_crdidx.clear();

    AnimMolPtr pAnim(pMol, qlib::no_throw_tag());
    if (pAnim.isnull()) return;

    const int natoms = static_cast<int>(m_aidcache.size());
    m_crdidx.resize(natoms);
    for (int i = 0; i < natoms; ++i) {
        try {
            m_crdidx[i] = pAnim->getCrdArrayInd(m_aidcache[i]);
        } catch (const qlib::LException &) {
            // An atom outside the coordinate array (alternate conformations
            // collapse onto one slot in a morph). Fall back for all of them
            // rather than mix the two ways of reading a position.
            m_crdidx.clear();
            return;
        }
    }
}

bool CoordTexSupport::ctAlloc(gfx::DisplayContext *pdc, const MolCoordPtr &pMol)
{
    const int natoms = static_cast<int>(m_aidcache.size());
    if (natoms == 0) {
        m_bNothingToDraw = true;
        return false;
    }

    m_nTexW = TEX2D_WIDTH;
    m_nTexH = (natoms + TEX2D_WIDTH - 1) / TEX2D_WIDTH;

    m_pCoordTex = pdc->createFloatDataTexture();
    if (m_pCoordTex == NULL || !m_pCoordTex->create(m_nTexW, m_nTexH, 3)) {
        // No float textures on this backend: the renderer falls back to its
        // own path, and must not be asked again.
        if (m_pCoordTex != NULL) {
            delete m_pCoordTex;
            m_pCoordTex = NULL;
        }
        m_bUseCoordTex = false;
        m_aidcache.clear();
        m_aid2idx.clear();
        m_coordbuf.clear();
        return false;
    }
    // A backend that exposes its upload buffer is written directly; only one
    // without needs a staging array of our own.
    if (m_pCoordTex->getStagingData() == NULL) {
        m_coordbuf.assign(static_cast<size_t>(m_nTexW) * m_nTexH * 3, 0.0f);
    }

    ctResolveCrdIndices(pMol);
    return ctGather(pMol);
}

bool CoordTexSupport::ctUpdate(const MolCoordPtr &pMol)
{
    if (!m_bUseCoordTex || m_pCoordTex == NULL) return false;
    if (m_aidcache.empty()) return false;
    if (pMol.isnull()) return false;

    return ctGather(pMol);
}

bool CoordTexSupport::ctGather(const MolCoordPtr &pMol)
{
    const int natoms = static_cast<int>(m_aidcache.size());

    // The object transform is not in the coordinate array, and the renderers
    // that read positions through getPos() get it applied for them, so it has
    // to be applied here too or the two paths would disagree.
    const qlib::Matrix4D xform = pMol->getXformMatrix();
    const bool bXform = !xform.isIdentAffine();

    // Positions go straight into the backend's upload buffer when it has one,
    // so they are not copied a second time on their way to the GPU.
    qfloat32 *pdst = static_cast<qfloat32 *>(m_pCoordTex->getStagingData());
    const bool bStaging = (pdst != NULL);
    if (!bStaging) pdst = &m_coordbuf[0];

    if (!m_crdidx.empty()) {
        AnimMolPtr pAnim(pMol, qlib::no_throw_tag());
        if (pAnim.isnull()) return false;
        // Re-read every frame: the array is reallocated as frames are loaded.
        const qfloat32 *pcrd = pAnim->getAtomCrdArray();
        if (pcrd == NULL) return false;

        for (int i = 0; i < natoms; ++i) {
            const qfloat32 *p = pcrd + m_crdidx[i] * 3;
            if (bXform) {
                Vector4D pos(p[0], p[1], p[2]);
                pos.w() = 1.0;
                xform.xform4D(pos);
                pdst[i * 3 + 0] = static_cast<qfloat32>(pos.x());
                pdst[i * 3 + 1] = static_cast<qfloat32>(pos.y());
                pdst[i * 3 + 2] = static_cast<qfloat32>(pos.z());
            } else {
                pdst[i * 3 + 0] = p[0];
                pdst[i * 3 + 1] = p[1];
                pdst[i * 3 + 2] = p[2];
            }
        }
    } else {
        for (int i = 0; i < natoms; ++i) {
            MolAtomPtr pAtom = pMol->getAtom(m_aidcache[i]);
            // The layout no longer describes this molecule; the caller has to
            // build it again.
            if (pAtom.isnull()) return false;
            const Vector4D pos = pAtom->getPos();
            pdst[i * 3 + 0] = static_cast<qfloat32>(pos.x());
            pdst[i * 3 + 1] = static_cast<qfloat32>(pos.y());
            pdst[i * 3 + 2] = static_cast<qfloat32>(pos.z());
        }
    }

    if (bStaging) {
        m_pCoordTex->updateFromStaging();
    } else {
        m_pCoordTex->update(pdst);
    }
    m_bCoordDirty = false;
    return true;
}
