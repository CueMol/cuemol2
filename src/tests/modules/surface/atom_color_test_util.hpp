// -*-Mode: C++;-*-
//
// Shared fixtures for the molecule-mode colouring tests of the surface
// renderers that colour a vertex by its nearest atom (molsurf in
// test_surf_atom_color.cpp, the map isosurface in test_mapsurf_atom_color.cpp):
// two atoms coloured differently, a display context that records what is
// drawn in world coordinates, and the brute-force nearest-atom expectation.
//

#ifndef TESTS_SURFACE_ATOM_COLOR_TEST_UTIL_HPP
#define TESTS_SURFACE_ATOM_COLOR_TEST_UTIL_HPP

#include <gtest/gtest.h>
#include <common.h>

#include "../../gfx/mock_display_context.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>
#include <gfx/SolidColor.hpp>
#include <qlib/Matrix4D.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

#include "molstr/ColoringScheme.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/ResidIndex.hpp"

#include <cmath>
#include <utility>
#include <vector>

namespace atomcoltest {

using qlib::LString;
using qlib::Vector4D;
using gfx::ColorPtr;

inline const Vector4D POS0(1.0, 2.0, 2.0);
inline const Vector4D POS1(3.0, 2.0, 2.0);

inline ColorPtr red() { return ColorPtr(gfx::SolidColor::createRGB(1.0, 0.0, 0.0)); }
inline ColorPtr blue() { return ColorPtr(gfx::SolidColor::createRGB(0.0, 0.0, 1.0)); }

/// Colours atom C0 red and every other atom blue.
class NameColoring : public molstr::ColoringScheme
{
public:
    bool getAtomColor(molstr::MolAtomPtr pAtom, ColorPtr &pcol) override
    {
        pcol = pAtom->getName().equals("C0") ? red() : blue();
        return true;
    }

    qlib::LCloneableObject *clone() const override { return MB_NEW NameColoring(*this); }
};

inline molstr::MolCoordPtr makeMol()
{
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    const Vector4D pos[2] = {POS0, POS1};
    for (int i = 0; i < 2; ++i) {
        molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
        pAtom->setParentUID(pMol->getUID());
        pAtom->setName(LString::format("C%d", i));
        pAtom->setElement(molstr::ElemSym::C);
        pAtom->setChainName("A");
        pAtom->setResIndex(molstr::ResidIndex(i + 1));
        pAtom->setResName("RES");
        pAtom->setPos(pos[i]);
        pMol->appendAtom(pAtom);
    }
    pMol->setName("mol");
    return pMol;
}

/// RGBA code of the colour the atom nearest to p should give, or 0 when the
/// two atoms are too close to call.
inline quint32 expectedCode(const Vector4D &p)
{
    const double d0 = (p - POS0).length();
    const double d1 = (p - POS1).length();
    if (std::abs(d0 - d1) < 1e-2)
        return 0;
    return (d0 < d1 ? red() : blue())->getCode();
}

/// Records the vertices (in world coordinates, through the matrix stack) and
/// colours of drawMesh() and of immediate-mode vertex()/color() calls, and
/// the model-view matrix a GPU primitive is drawn under.
class RecordDC : public MockDisplayContext
{
public:
    std::vector<std::pair<Vector4D, quint32> > m_verts;
    ColorPtr m_cur;
    qlib::Matrix4D m_gpuMat;
    bool m_bFile;

    explicit RecordDC(bool bFile) : m_bFile(bFile) { clearMatStack(); }

    bool isFile() const override { return m_bFile; }
    void color(const ColorPtr &c) override { m_cur = c; }
    void vertex(const Vector4D &v) override
    {
        Vector4D w = v;
        xform_vec(w);
        m_verts.push_back(std::make_pair(w, m_cur.isnull() ? 0u : m_cur->getCode()));
    }
    void drawMesh(const gfx::Mesh &mesh) override
    {
        const int nv = mesh.getVertSize();
        for (int i = 0; i < nv; ++i) {
            ColorPtr c;
            mesh.getCol(c, i);
            Vector4D w = mesh.getVertex(i);
            xform_vec(w);
            m_verts.push_back(std::make_pair(w, c.isnull() ? 0u : c->getCode()));
        }
    }
    void drawElem(const gfx::AbstDrawElem &) override { m_gpuMat = getModelViewMat(); }
};

/// Count of vertices whose colour is not the nearest atom's (checked ones only).
inline int countMismatches(const std::vector<std::pair<Vector4D, quint32> > &verts, int &nchecked)
{
    int nbad = 0;
    nchecked = 0;
    for (const auto &v : verts) {
        const quint32 want = expectedCode(v.first);
        if (want == 0)
            continue;
        ++nchecked;
        if (v.second != want)
            ++nbad;
    }
    return nbad;
}

class SceneFixture : public ::testing::Test
{
protected:
    qsys::ScenePtr m_pScene;
    molstr::MolCoordPtr m_pMol;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pMol = makeMol();
        m_pScene->addObject(m_pMol);
    }

    void TearDown() override
    {
        const qlib::uid_t uid = m_pScene->getUID();
        m_pMol = molstr::MolCoordPtr();
        m_pScene = qsys::ScenePtr();
        qsys::SceneManager::getInstance()->destroyScene(uid);
    }
};

}  // namespace atomcoltest

#endif
