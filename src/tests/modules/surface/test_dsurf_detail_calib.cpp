//
// Calibration harness for the dsurface "detail" property.
//
// detail must mean the same mesh density whichever surfalgor is selected,
// otherwise its default stops being sensible when the algorithm is switched.
// EDTSurf's voxel size is the reference; DISTFIELD_SPACING_COEFF and
// MESHMS_MESH_SIZE_COEFF in DirectSurfRenderer.cpp scale the other two onto
// it. This harness prints the vertex counts the three algorithms produce for
// the same detail on 1CRN, which is how those coefficients were measured.
//
// It is not a contract test (there is no threshold to fail against), so it is
// DISABLED_ and runs only on demand:
//
//   test_surface --gtest_also_run_disabled_tests --gtest_filter='*DetailCalib*'
//
// Re-run it when MeshMS is updated or the distance-field builder changes, and
// record the result in docs/architecture/direct-surface-renderer.md.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/DirectSurfRenderer.hpp"

#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>

#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/AtomIterator.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/ResidIndex.hpp"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <string>
#include <vector>

using qlib::LString;
using surface::DirectSurfRenderer;

namespace {

/// Exposes the mesh cache so the vertex count can be read without drawing.
class ProbeCalib : public DirectSurfRenderer
{
public:
    using DirectSurfRenderer::ensureMeshCache;
    using DirectSurfRenderer::m_verts;
    using DirectSurfRenderer::m_faces;
};

struct CalibRow
{
    int detail;
    int nverts[3];
    double ms[3];
};

const char *ALGOS[3] = {"edtsurf", "distfield", "meshms"};

/// Read the ATOM/HETATM coordinates of a PDB file into a molecule.
///
/// The real PDB reader is not used here: in the source tree the test
/// sysconfig resolves its data directory one level too deep, so the reader
/// fails on symop.dat. Only positions and elements matter for a density
/// measurement, and those come straight out of the fixed-column record.
molstr::MolCoordPtr loadPdbAtoms(const char *path)
{
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    std::ifstream ifs(path);
    if (!ifs)
        return molstr::MolCoordPtr();

    std::string line;
    while (std::getline(ifs, line)) {
        if (line.size() < 54)
            continue;
        if (line.compare(0, 6, "ATOM  ") != 0 && line.compare(0, 6, "HETATM") != 0)
            continue;

        const LString name(qlib::LString(line.substr(12, 4).c_str()).trim(" "));
        LString elem(qlib::LString(line.size() >= 78 ? line.substr(76, 2) : std::string())
                         .trim(" "));
        if (elem.isEmpty()) {
            // Fall back to the first alphabetic character of the atom name.
            elem = name.substr(0, 1);
        }

        molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
        pAtom->setParentUID(pMol->getUID());
        pAtom->setName(name);
        pAtom->setElement(molstr::ElemSym::str2SymID(elem));
        // The chain / residue identity has to be real: appendAtom() keys on
        // it, so collapsing every atom into one residue drops all but the
        // first atom of each name.
        pAtom->setChainName(LString(line.substr(21, 1).c_str()).trim(" "));
        pAtom->setResIndex(molstr::ResidIndex(std::atoi(line.substr(22, 4).c_str())));
        pAtom->setResName(LString(line.substr(17, 3).c_str()).trim(" "));
        pAtom->setPos(qlib::Vector4D(std::atof(line.substr(30, 8).c_str()),
                                     std::atof(line.substr(38, 8).c_str()),
                                     std::atof(line.substr(46, 8).c_str())));
        pMol->appendAtom(pAtom);
    }
    return pMol;
}

}  // namespace

TEST(DsurfDetailCalib, DISABLED_VertexCountsPerAlgorithm)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();

    molstr::MolCoordPtr pMol = loadPdbAtoms(CUEMOL2_TEST_DATA_DIR "/1CRN.pdb");
    ASSERT_FALSE(pMol.isnull()) << "cannot read 1CRN.pdb";
    ASSERT_GT(pMol->getAtomSize(), 0);
    pMol->setName("mol");
    pScene->addObject(pMol);

    const int details[] = {2, 4, 6, 10, 16, 24, 32};
    const int ndet = (int) (sizeof(details) / sizeof(details[0]));
    std::vector<CalibRow> rows;

    for (int d = 0; d < ndet; ++d) {
        CalibRow row;
        row.detail = details[d];

        for (int a = 0; a < 3; ++a) {
            ProbeCalib *pProbe = MB_NEW ProbeCalib();
            qsys::RendererPtr pRend(pProbe);
            pProbe->resetAllProps();
            pMol->attachRenderer(pRend);
            pRend->setPropStr("surftype", "ses");
            pRend->setPropReal("proberad", 1.4);
            pRend->setPropStr("surfalgor", ALGOS[a]);
            pRend->setPropInt("detail", row.detail);

            const std::chrono::steady_clock::time_point t0 =
                std::chrono::steady_clock::now();
            pProbe->ensureMeshCache();
            row.ms[a] = std::chrono::duration<double, std::milli>(
                            std::chrono::steady_clock::now() - t0)
                            .count();
            row.nverts[a] = pProbe->m_verts.size();

            pMol->destroyRenderer(pRend->getUID());
        }
        rows.push_back(row);
    }

    std::printf("\n1CRN (%d atoms) SES probe=1.4: vertices (ms) per detail\n",
                pMol->getAtomSize());
    std::printf("%8s %20s %20s %20s %12s %12s\n", "detail", "edtsurf", "distfield",
                "meshms", "df/edt", "ms/edt");
    for (const CalibRow &r : rows) {
        std::printf("%8d %13d(%5.0f) %13d(%5.0f) %13d(%5.0f) %12.3f %12.3f\n", r.detail,
                    r.nverts[0], r.ms[0], r.nverts[1], r.ms[1], r.nverts[2], r.ms[2],
                    r.nverts[0] > 0 ? double(r.nverts[1]) / double(r.nverts[0]) : 0.0,
                    r.nverts[0] > 0 ? double(r.nverts[2]) / double(r.nverts[0]) : 0.0);
    }
    std::printf(
        "\nA ratio of 1.0 means the algorithm matches EDTSurf at that detail.\n"
        "Vertex count goes as 1/size^2, so scale the coefficient by sqrt(ratio).\n"
        "meshms columns repeat distfield when this build has no MeshMS.\n\n");

    const qlib::uid_t uid = pScene->getUID();
    pMol = molstr::MolCoordPtr();
    pScene = qsys::ScenePtr();
    qsys::SceneManager::getInstance()->destroyScene(uid);
}

// The dense distance-field grid grows with the molecule as well as with
// detail, so the top of the ladder is where the cell budget has to hold. This
// replicates 1CRN on a lattice to get a large-molecule box without shipping a
// large test file, and reports what each algorithm costs on it.
TEST(DsurfDetailCalib, DISABLED_LargeMoleculeCost)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();

    molstr::MolCoordPtr pSrc = loadPdbAtoms(CUEMOL2_TEST_DATA_DIR "/1CRN.pdb");
    ASSERT_FALSE(pSrc.isnull());

    // 3 x 3 x 3 copies, 35 A apart: ~8800 atoms spanning roughly 100 A.
    const int N = 6;
    const double STEP = 35.0;
    molstr::MolCoordPtr pMol(MB_NEW molstr::MolCoord());
    int ncopy = 0;
    for (int i = 0; i < N; ++i) {
        for (int j = 0; j < N; ++j) {
            for (int k = 0; k < N; ++k) {
                const qlib::Vector4D off(i * STEP, j * STEP, k * STEP);
                // appendAtom() keys on (chain, residue, name): each copy needs
                // its own residue range or all but the first are dropped.
                const int resBase = ncopy * 10000;
                molstr::AtomIterator ai(pSrc);
                for (ai.first(); ai.hasMore(); ai.next()) {
                    molstr::MolAtomPtr pS = ai.get();
                    molstr::MolAtomPtr pAtom(MB_NEW molstr::MolAtom());
                    pAtom->setParentUID(pMol->getUID());
                    pAtom->setName(pS->getName());
                    pAtom->setElement(pS->getElement());
                    pAtom->setChainName("A");
                    pAtom->setResIndex(
                        molstr::ResidIndex(resBase + pS->getResIndex().first));
                    pAtom->setResName(pS->getResName());
                    pAtom->setPos(pS->getPos() + off);
                    pMol->appendAtom(pAtom);
                }
                ++ncopy;
            }
        }
    }
    pMol->setName("big");
    pScene->addObject(pMol);

    std::printf("\n1CRN x %d^3 (%d atoms) SES probe=1.4\n", N, pMol->getAtomSize());
    std::printf("%8s %12s %14s %12s\n", "detail", "algorithm", "vertices", "ms");
    // detail 6 is where no budget fires, so all three deliver the density
    // that was asked for and the times are comparable.
    const int bigDetails[] = {6, 16, 32};
    for (int di = 0; di < 3; ++di) {
        const int d = bigDetails[di];
        for (int a = 0; a < 3; ++a) {
            ProbeCalib *pProbe = MB_NEW ProbeCalib();
            qsys::RendererPtr pRend(pProbe);
            pProbe->resetAllProps();
            pMol->attachRenderer(pRend);
            pRend->setPropStr("surftype", "ses");
            pRend->setPropStr("surfalgor", ALGOS[a]);
            pRend->setPropInt("detail", d);

            const std::chrono::steady_clock::time_point t0 =
                std::chrono::steady_clock::now();
            pProbe->ensureMeshCache();
            const double ms = std::chrono::duration<double, std::milli>(
                                  std::chrono::steady_clock::now() - t0)
                                  .count();
            std::printf("%8d %12s %14d %12.0f\n", d, ALGOS[a], pProbe->m_verts.size(), ms);
            pMol->destroyRenderer(pRend->getUID());
        }
    }
    std::printf("\n");

    const qlib::uid_t uid = pScene->getUID();
    pMol = molstr::MolCoordPtr();
    pSrc = molstr::MolCoordPtr();
    pScene = qsys::ScenePtr();
    qsys::SceneManager::getInstance()->destroyScene(uid);
}
