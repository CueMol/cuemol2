// -*-Mode: C++;-*-
//
// GLSL-based GPU map mesh renderer (GpuPrim-based implementation)
//

#include <common.h>

#include "GLSLMapMeshRenderer2.hpp"
#include "DensityMap.hpp"
#include "MapLod.hpp"

#include <qsys/ScrEventManager.hpp>
#include <qsys/ViewEvent.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

#define SCALE 0x1000

using namespace xtal;
using qlib::Matrix3D;
using qlib::Matrix4D;
using qsys::ScrEventManager;

GLSLMapMeshRenderer2::GLSLMapMeshRenderer2() : super_t()
{
    m_bChkShaderDone = false;
    m_nBufSize = 100;
    m_nStep = 1;
    m_lw = 1.0;
    m_bPBC = false;
    m_bAutoUpdate = true;
    m_bDragUpdate = false;
    m_pGpuPrim = nullptr;
    m_bMapTexOK = false;
}

GLSLMapMeshRenderer2::~GLSLMapMeshRenderer2()
{
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->removeViewListener(this);
}

/////////////////////////////////

const char *GLSLMapMeshRenderer2::getTypeName() const
{
    return "gpu_mapmesh";
}

double GLSLMapMeshRenderer2::getMaxExtent() const
{
    ScalarObject *pMap = qlib::ensureNotNull(getScalarObj());

    const double xmax = m_nBufSize * pMap->getColGridSize() / 2.0;
    const double ymax = m_nBufSize * pMap->getRowGridSize() / 2.0;
    const double zmax = m_nBufSize * pMap->getSecGridSize() / 2.0;

    return qlib::min(xmax, qlib::min(ymax, zmax));
}

void GLSLMapMeshRenderer2::setSceneID(qlib::uid_t nid)
{
    super_t::setSceneID(nid);
    if (nid == qlib::invalid_uid) return;

    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->addViewListener(nid, this);
}

qlib::uid_t GLSLMapMeshRenderer2::detachObj()
{
    ScrEventManager *pSEM = ScrEventManager::getInstance();
    pSEM->removeViewListener(this);

    return super_t::detachObj();
}

void GLSLMapMeshRenderer2::viewChanged(qsys::ViewEvent &ev)
{
    const int nType = ev.getType();

    if (getEffectiveRegionMode() == REGION_FULL) {
        // Full region mode: the center follows the view without rebuilding
        // and the visible box drives the debounced region refinement
        handleFullModeViewEvent(ev, m_bAutoUpdate, m_bDragUpdate);
        return;
    }

    // Box region mode: the historical center following
    if (nType != qsys::ViewEvent::VWE_PROPCHG &&
        nType != qsys::ViewEvent::VWE_PROPCHG_DRG)
        return;

    if (!m_bAutoUpdate && !m_bDragUpdate) return;

    if (!ev.getDescr().equals("center")) return;

    qsys::View *pView = ev.getTargetPtr();
    if (pView == NULL) return;

    Vector4D c = pView->getViewCenter();

    if (m_bDragUpdate) {
        if (nType == qsys::ViewEvent::VWE_PROPCHG ||
            nType == qsys::ViewEvent::VWE_PROPCHG_DRG) {
            setCenter(c);
            setDefaultPropFlag("center", false);
        }
        return;
    }

    if (m_bAutoUpdate) {
        if (nType == qsys::ViewEvent::VWE_PROPCHG) {
            setCenter(c);
            setDefaultPropFlag("center", false);
        }
        return;
    }
}

bool GLSLMapMeshRenderer2::initShader(DisplayContext *pdc)
{
    if (m_bChkShaderDone) return true;

    MB_ASSERT(m_pGpuPrim == nullptr);
    m_pGpuPrim = MB_NEW MapMeshGpuPrim();
    if (!m_pGpuPrim->init(pdc)) {
        LOG_DPRINTLN("GLSLMapMeshRenderer2> ERROR: cannot init draw object.");
        delete m_pGpuPrim;
        m_pGpuPrim = nullptr;
        m_bChkShaderDone = true;
        return false;
    }

    m_bChkShaderDone = true;
    return true;
}

void GLSLMapMeshRenderer2::unloading()
{
    delete m_pGpuPrim;
    m_pGpuPrim = nullptr;

    // release the lookup texture while the view context is still alive
    m_mapBufTex.invalidate();
    m_bMapTexOK = false;

    super_t::unloading();
}

void GLSLMapMeshRenderer2::invalidateDisplayCache()
{
    m_bMapTexOK = false;
    super_t::invalidateDisplayCache();
}

/////////////////////////////////

void GLSLMapMeshRenderer2::make3DTexMap(DisplayContext *pdc, ScalarObject *pMap,
                                        DensityMap *pXtal)
{
    if (getEffectiveRegionMode() == REGION_FULL) {
        make3DTexMapFull(pdc, pMap);
        return;
    }
    m_nStep = 1;

    const Vector4D cent = getCenter();
    const double extent = getExtent();

    Vector4D vmin(cent.x() - extent, cent.y() - extent, cent.z() - extent);
    Vector4D vmax(cent.x() + extent, cent.y() + extent, cent.z() + extent);

    vmin -= pMap->getOrigin();
    vmax -= pMap->getOrigin();

    if (pXtal != NULL) {
        const CrystalInfo &xt = pXtal->getXtalInfo();
        xt.orthToFrac(vmin);
        xt.orthToFrac(vmax);

        // check PBC (the stored block must span the whole cell)
        const double dimx = pMap->getColGridSize() * pMap->getColNo();
        const double dimy = pMap->getRowGridSize() * pMap->getRowNo();
        const double dimz = pMap->getSecGridSize() * pMap->getSecNo();
        const double cea = xt.a();
        const double ceb = xt.b();
        const double cec = xt.c();
        const bool bSpansCell = qlib::isNear4(dimx, cea) &&
                                qlib::isNear4(dimy, ceb) &&
                                qlib::isNear4(dimz, cec);
        m_bPBC = isPBCEligible(pXtal, bSpansCell);
    }

    if (pXtal != NULL) {
        vmin.x() *= pXtal->getColInterval();
        vmin.y() *= pXtal->getRowInterval();
        vmin.z() *= pXtal->getSecInterval();
        vmax.x() *= pXtal->getColInterval();
        vmax.y() *= pXtal->getRowInterval();
        vmax.z() *= pXtal->getSecInterval();
    } else {
        vmin.x() /= pMap->getColGridSize();
        vmin.y() /= pMap->getRowGridSize();
        vmin.z() /= pMap->getSecGridSize();
        vmax.x() /= pMap->getColGridSize();
        vmax.y() /= pMap->getRowGridSize();
        vmax.z() /= pMap->getSecGridSize();
    }

    if (!m_bPBC) {
        vmin.x() = floor(qlib::max<double>(vmin.x(), pMap->getStartCol()));
        vmin.y() = floor(qlib::max<double>(vmin.y(), pMap->getStartRow()));
        vmin.z() = floor(qlib::max<double>(vmin.z(), pMap->getStartSec()));

        vmax.x() =
            floor(qlib::min<double>(vmax.x(), pMap->getStartCol() + pMap->getColNo()));
        vmax.y() =
            floor(qlib::min<double>(vmax.y(), pMap->getStartRow() + pMap->getRowNo()));
        vmax.z() =
            floor(qlib::min<double>(vmax.z(), pMap->getStartSec() + pMap->getSecNo()));
    }

    m_nMapColNo = pMap->getColNo();
    m_nMapRowNo = pMap->getRowNo();
    m_nMapSecNo = pMap->getSecNo();

    m_nStCol = int(vmin.x());
    m_nStRow = int(vmin.y());
    m_nStSec = int(vmin.z());

    int stcol = m_nStCol - pMap->getStartCol();
    int strow = m_nStRow - pMap->getStartRow();
    int stsec = m_nStSec - pMap->getStartSec();

    // the box can lie entirely outside the map (non-PBC): an empty region
    // means there is nothing to upload
    int ncol = qlib::max(0, int(vmax.x() - vmin.x()));
    int nrow = qlib::max(0, int(vmax.y() - vmin.y()));
    int nsec = qlib::max(0, int(vmax.z() - vmin.z()));

    m_nActCol = ncol;
    m_nActRow = nrow;
    m_nActSec = nsec;
    if (ncol <= 0 || nrow <= 0 || nsec <= 0) {
        m_bMapTexOK = false;
        return;
    }

    MapBufTex::DataArray &maptmp = m_mapBufTex.m_data;
    if (int(maptmp.cols()) != ncol || int(maptmp.rows()) != nrow ||
        int(maptmp.secs()) != nsec)
        maptmp.resize(ncol, nrow, nsec);

    m_nActCol = ncol;
    m_nActRow = nrow;
    m_nActSec = nsec;

    MB_DPRINT("ncol: %d\n", ncol);
    MB_DPRINT("nrow: %d\n", nrow);
    MB_DPRINT("nsec: %d\n", nsec);

    // Fill CPU voxel data
    for (int k = 0; k < nsec; k++)
        for (int j = 0; j < nrow; j++)
            for (int i = 0; i < ncol; i++) {
                maptmp.at(i, j, k) = getMap(pMap, stcol + i, strow + j, stsec + k);
            }

    // Sync to GPU (the lookup texture is immutable: re-created per region)
    if (!m_mapBufTex.create(pdc)) return;

    {
        const double level = resolveLevel(pMap);
        double lvtmp = floor((level - pMap->getLevelBase()) / pMap->getLevelStep());
        unsigned int lv = (unsigned int)lvtmp;
        if (lvtmp < 0) lv = 0;
        if (lvtmp > 0xFF) lv = 0xFF;

        MB_DPRINTLN("set isolevel=%d", lv);
        m_isolevel = lv;
    }

    MB_DPRINTLN("make3D texture OK.");
    m_bMapTexOK = true;
}

void GLSLMapMeshRenderer2::make3DTexMapFull(DisplayContext *pdc, ScalarObject *pMap)
{
    // Full region mode: the block clipped to the padded view box /
    // molecule boundary at the budget-derived stride (aligned to the block
    // start), copied into the buffer texture with extractBlockBytes(); no
    // periodic wrap.
    m_bPBC = false;

    m_nMapColNo = pMap->getColNo();
    m_nMapRowNo = pMap->getRowNo();
    m_nMapSecNo = pMap->getSecNo();

    const int st[3] = {pMap->getStartCol(), pMap->getStartRow(), pMap->getStartSec()};
    const int n[3] = {pMap->getColNo(), pMap->getRowNo(), pMap->getSecNo()};
    if (n[0] <= 0 || n[1] <= 0 || n[2] <= 0) return;

    int lo[3], hi[3], s;
    computeFullRegion(pMap, lo, hi, s);

    const LodRange rc = lodAlignRange(lo[0], hi[0], st[0], n[0], s);
    const LodRange rr = lodAlignRange(lo[1], hi[1], st[1], n[1], s);
    const LodRange rs = lodAlignRange(lo[2], hi[2], st[2], n[2], s);
    const int nn[3] = {rc.span / s + 1, rr.span / s + 1, rs.span / s + 1};

    MapBufTex::DataArray &maptmp = m_mapBufTex.m_data;
    if (int(maptmp.cols()) != nn[0] || int(maptmp.rows()) != nn[1] ||
        int(maptmp.secs()) != nn[2])
        maptmp.resize(nn[0], nn[1], nn[2]);

    ScalarObject::MapBlockSpec sp;
    sp.start[0] = rc.start - st[0];
    sp.start[1] = rr.start - st[1];
    sp.start[2] = rs.start - st[2];
    sp.size[0] = nn[0];
    sp.size[1] = nn[1];
    sp.size[2] = nn[2];
    sp.step = s;
    pMap->extractBlockBytes(sp, false, 0, &maptmp.at(0, 0, 0));

    m_nStCol = rc.start;
    m_nStRow = rr.start;
    m_nStSec = rs.start;
    m_nActCol = nn[0];
    m_nActRow = nn[1];
    m_nActSec = nn[2];
    m_nStep = s;

    const int clo[3] = {rc.start, rr.start, rs.start};
    const int chi[3] = {rc.start + rc.span, rr.start + rr.span, rs.start + rs.span};
    setCurRegion(clo, chi, s);

    // Sync to GPU (the lookup texture is immutable: re-created per region)
    if (!m_mapBufTex.create(pdc)) return;

    {
        const double level = resolveLevel(pMap);
        double lvtmp = floor((level - pMap->getLevelBase()) / pMap->getLevelStep());
        unsigned int lv = (unsigned int)lvtmp;
        if (lvtmp < 0) lv = 0;
        if (lvtmp > 0xFF) lv = 0xFF;
        m_isolevel = lv;
    }

    MB_DPRINTLN("GLSLMapMesh2> full region %dx%dx%d samples, step %d", nn[0], nn[1], nn[2], s);
    m_bMapTexOK = true;
}

void GLSLMapMeshRenderer2::display(DisplayContext *pdc)
{
    if (!m_bChkShaderDone) initShader(pdc);

    if (m_pGpuPrim == nullptr) return;

    ScalarObject *pMap = getScalarObj();
    DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

    if (!m_bMapTexOK) {
        if (!pMap) return;
        make3DTexMap(pdc, pMap, pXtal);
    }

    pdc->color(getColor());
    pdc->setLineWidth(m_lw);
    pdc->setLighting(false);

    pdc->pushMatrix();

    // map origin (MRC ORIGIN for DensityMap; zero for crystallographic maps)
    const Vector4D vorig = pMap->getOrigin();
    if (pXtal == NULL || !vorig.isZero3D()) pdc->translate(vorig);

    if (pXtal != NULL) {
        Matrix3D orthmat = pXtal->getXtalInfo().getOrthMat();
        pdc->multMatrix(Matrix4D(orthmat));
    }

    Vector4D vtmp;
    if (pXtal != NULL)
        vtmp = Vector4D(1.0 / double(pXtal->getColInterval()),
                        1.0 / double(pXtal->getRowInterval()),
                        1.0 / double(pXtal->getSecInterval()));
    else
        vtmp = Vector4D(pMap->getColGridSize(), pMap->getRowGridSize(),
                        pMap->getSecGridSize());

    pdc->scale(vtmp);

    vtmp = Vector4D(m_nStCol, m_nStRow, m_nStSec);
    pdc->translate(vtmp);

    // strided samples: one texture cell spans m_nStep grid nodes
    if (m_nStep > 1) pdc->scale(Vector4D(m_nStep, m_nStep, m_nStep));

    renderGPU(pdc);

    pdc->popMatrix();
}

void GLSLMapMeshRenderer2::renderGPU(DisplayContext *pdc)
{
    if (m_pGpuPrim == nullptr) return;
    if (!m_mapBufTex.isValid()) return;

    MapMeshDrawParams params;
    params.pBufTex = &m_mapBufTex;
    params.isolevel = m_isolevel;
    params.ncol = m_nActCol;
    params.nrow = m_nActRow;
    params.nsec = m_nActSec;
    params.frag_alpha = float(pdc->getAlpha());

    m_pGpuPrim->draw(pdc, params);
}

float getCrossVal2(quint8 d0, quint8 d1, quint8 isolev)
{
    if (d0 == d1) return -1.0;
    float crs = float(isolev - d0) / float(d1 - d0);
    return crs;
}

Vector4D GLSLMapMeshRenderer2::calcVecCrs(const IntVec3D &tpos, int iv0, float crs0,
                                           int ivbase)
{
    Vector4D vbase = tpos.vec4();
    Vector4D v0, v1, vr;

    v0 = vbase + m_ivdel[ivbase + iv0].vec4();
    v1 = vbase + m_ivdel[ivbase + (iv0 + 1) % 4].vec4();

    vr = v0 + (v1 - v0).scale(crs0);
    return vr;
}

void GLSLMapMeshRenderer2::renderCPU(DisplayContext *pdc)
{
    ScalarObject *pMap = getScalarObj();
    DensityMap *pXtal = dynamic_cast<DensityMap *>(pMap);

    if (!m_bMapTexOK) {
        if (!pMap) return;
        make3DTexMap(pdc, pMap, pXtal);

        m_ivdel[0] = IntVec3D(0, 0, 0);
        m_ivdel[1] = IntVec3D(1, 0, 0);
        m_ivdel[2] = IntVec3D(1, 1, 0);
        m_ivdel[3] = IntVec3D(0, 1, 0);

        m_ivdel[4] = IntVec3D(0, 0, 0);
        m_ivdel[5] = IntVec3D(0, 1, 0);
        m_ivdel[6] = IntVec3D(0, 1, 1);
        m_ivdel[7] = IntVec3D(0, 0, 1);

        m_ivdel[8] = IntVec3D(0, 0, 0);
        m_ivdel[9] = IntVec3D(0, 0, 1);
        m_ivdel[10] = IntVec3D(1, 0, 1);
        m_ivdel[11] = IntVec3D(1, 0, 0);
    }

    quint8 isolev;
    {
        const double level = resolveLevel(pMap);
        double lvtmp = floor((level - pMap->getLevelBase()) / pMap->getLevelStep());
        unsigned int lv = (unsigned int)lvtmp;
        if (lvtmp < 0) lv = 0;
        if (lvtmp > 0xFF) lv = 0xFF;
        isolev = lv;
    }

    int ncol = m_nActCol;
    int nrow = m_nActRow;
    int nsec = m_nActSec;

    int triTable[16][2] = {
        {-1, -1}, {0, 3}, {0, 1}, {1, 3}, {1, 2}, {-1, -1}, {0, 2}, {2, 3},
        {2, 3},   {0, 2}, {-1, -1}, {1, 2}, {1, 3}, {0, 1},  {0, 3}, {-1, -1}
    };

    quint8 val[4];
    MapBufTex::DataArray &maptmp = m_mapBufTex.m_data;

    pdc->startLines();

    for (int k = 0; k < nsec - 1; k++)
        for (int j = 0; j < nrow - 1; j++)
            for (int i = 0; i < ncol - 1; i++) {
                for (int iplane = 0; iplane < 3; ++iplane) {
                    quint8 flag = 0U;
                    quint8 mask = 1U;
                    IntVec3D tpos(i, j, k);

                    for (int ii = 0; ii < 4; ++ii) {
                        IntVec3D iv = tpos + m_ivdel[ii + iplane * 4];
                        val[ii] = maptmp.at(iv.ai(1), iv.ai(2), iv.ai(3));
                        if (val[ii] > isolev) flag += mask;
                        mask = mask << 1;
                    }

                    int iv0 = triTable[flag][0];
                    int iv1 = triTable[flag][1];
                    if (iv0 < 0) continue;
                    float crs0 = getCrossVal2(val[iv0], val[(iv0 + 1) % 4], isolev);
                    float crs1 = getCrossVal2(val[iv1], val[(iv1 + 1) % 4], isolev);
                    if (crs0 >= -0.0 && crs1 >= -0.0) {
                        Vector4D v0 = calcVecCrs(tpos, iv0, crs0, iplane * 4);
                        Vector4D v1 = calcVecCrs(tpos, iv1, crs1, iplane * 4);
                        pdc->vertex(v0);
                        pdc->vertex(v1);
                    }
                }
            }
    pdc->end();
}
