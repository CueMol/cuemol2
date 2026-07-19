// -*-Mode: C++;-*-
//
// AMBER NetCDF binary trajectory file reader
//

#include <common.h>

#include "AmberNetCDFReader.hpp"
#include "TrajBlock.hpp"
#include "Trajectory.hpp"
#include "Netcdf3InStream.hpp"

#include <qlib/LExceptions.hpp>

#include <vector>

using namespace mdtools;
using qlib::LString;

AmberNetCDFReader::AmberNetCDFReader() : super_t()
{
    m_nSkip = 1;
    m_natom = 0;
}

AmberNetCDFReader::~AmberNetCDFReader() {}

///////////////////////////////////////////

const char *AmberNetCDFReader::getName() const
{
    return "ambnetcdftraj";
}

const char *AmberNetCDFReader::getTypeDescr() const
{
    return "AMBER NetCDF trajectory (*.nc)";
}

const char *AmberNetCDFReader::getFileExt() const
{
    return "*.nc";
}

int AmberNetCDFReader::canHandleContent(qlib::InStream &ins) const
{
    // NetCDF 3 begins with the "CDF" magic and a version byte (1, 2 or 5).
    char buf[4];
    int total = 0;
    while (total < 4) {
        int n = ins.read(buf, total, 4 - total);
        if (n <= 0) break;
        total += n;
    }
    if (total < 4) return CONTENT_UNKNOWN;

    if (buf[0] != 'C' || buf[1] != 'D' || buf[2] != 'F') return CONTENT_UNKNOWN;
    const int version = static_cast<unsigned char>(buf[3]);
    return (version == 1 || version == 2 || version == 5) ? CONTENT_YES : CONTENT_UNKNOWN;
}

qsys::ObjectPtr AmberNetCDFReader::createDefaultObj() const
{
    return qsys::ObjectPtr(MB_NEW TrajBlock());
}

///////////////////////////////////////////

bool AmberNetCDFReader::read(qlib::InStream &ins)
{
    TrajBlockPtr pTB(getTarget<TrajBlock>());
    if (pTB.isnull()) {
        MB_THROW(qlib::RuntimeException, "AmberNetCDFReader: not attached to a TrajBlock");
        return false;
    }
    TrajectoryPtr pTraj = getTargTraj();
    if (pTraj.isnull()) {
        MB_THROW(qlib::RuntimeException, "AmberNetCDFReader: target Trajectory not found");
        return false;
    }

    Netcdf3InStream nc(ins);
    nc.parseHeader();

    const LString conv = nc.getConvention();
    if (conv.equals("AMBERRESTART")) {
        MB_THROW(qlib::FileFormatException,
                 "AMBER NetCDF restart (AMBERRESTART) is not supported");
        return false;
    }
    if (!conv.equals("AMBER")) {
        MB_THROW(qlib::FileFormatException, "not an AMBER NetCDF trajectory file");
        return false;
    }

    const int natom = nc.getNatoms();
    if (natom <= 0) {
        MB_THROW(qlib::FileFormatException, "AMBER NetCDF: missing atom dimension");
        return false;
    }
    m_natom = natom;

    const int topoN = static_cast<int>(pTraj->getAllAtomSize());
    if (topoN > 0 && natom != topoN) {
        LString msg = LString::format("AMBER NetCDF: inconsistent NATOM with topology %d!=%d",
                                      natom, topoN);
        MB_THROW(qlib::FileFormatException, msg);
        return false;
    }
    const int nReadAtoms = (topoN > 0) ? static_cast<int>(pTraj->getAtomSize()) : natom;
    pTB->initFrames(nReadAtoms);
    LOG_DPRINTLN("AmberNetCDF> NATOM=%d", natom);

    std::vector<qfloat32> filecrd;
    qfloat32 cell[6] = {0, 0, 0, 0, 0, 0};
    const int nframes = nc.getNumFrames();  // -1 when streaming/unknown

    int frameno = 0;
    for (;;) {
        if (nframes >= 0 && frameno >= nframes) break;
        if (!nc.readFrame(filecrd, cell)) break;  // clean end of stream

        // Keep every m_nSkip-th frame.
        if (frameno % m_nSkip == 0) {
            qfloat32 *pcoord = pTB->appendFrame();
            qfloat32 *pcell = pTB->getCellArray(pTB->getSize() - 1);
            for (int i = 0; i < 6; ++i) pcell[i] = cell[i];
            // AMBER coordinates are already in Angstrom (scale 1.0).
            scatterCoords(pTraj, filecrd, natom, pcoord, 1.0f);
            pTB->setLoaded(pTB->getSize() - 1, true);
        }
        ++frameno;
    }

    LOG_DPRINTLN("AmberNetCDF> read %d frames (skip=%d)", pTB->getSize(), m_nSkip);
    return true;
}

void AmberNetCDFReader::loadFrm(int ifrm, TrajBlock *pTB)
{
    // Unreachable: read() reads all frames eagerly. Seek-based lazy loading is
    // deferred until develop exposes a portable seekable-stream interface.
    MB_THROW(qlib::RuntimeException, "AmberNetCDFReader: lazy frame load not implemented");
}
