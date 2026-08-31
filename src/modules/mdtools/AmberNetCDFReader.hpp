// -*-Mode: C++;-*-
//
// AMBER NetCDF binary trajectory file reader
//

#ifndef AMBER_NETCDF_TRAJECTORY_READER_HPP_
#define AMBER_NETCDF_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

class Trajectory;

///
/// AMBER NetCDF binary trajectory reader (block-centric).
///
/// Reads one AMBER NetCDF trajectory (Conventions="AMBER") into a single
/// TrajBlock, mirroring the XtcTrajReader flow (createDefaultObj() returns the
/// block; the caller attaches it, calls read(), then appends the block to the
/// target Trajectory). The NetCDF 3 container is parsed by Netcdf3InStream.
/// Coordinates are already in Angstrom (no unit scaling) and the periodic cell
/// is read directly as {a, b, c, alpha, beta, gamma}.
///
/// Frames are read eagerly and appended one at a time (TrajBlock::appendFrame).
/// Seek-based lazy loading is not implemented (develop's InStream has no
/// portable seek), so loadFrm() is unreachable. Single-frame NetCDF restart
/// files (Conventions="AMBERRESTART") are not supported.
///
class MDTOOLS_API AmberNetCDFReader : public TrajBlockReader
{
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

public:
    AmberNetCDFReader();
    virtual ~AmberNetCDFReader();

    // ---- Information query ----

    virtual const char *getName() const override;
    virtual const char *getTypeDescr() const override;
    virtual const char *getFileExt() const override;
    virtual int canHandleContent(qlib::InStream &ins) const override;

    /// The reader's default object is a TrajBlock (appended to a Trajectory).
    virtual qsys::ObjectPtr createDefaultObj() const override;

    // ---- Read ----

    virtual bool read(qlib::InStream &ins) override;

    /// Lazy-load one frame into pTB (not implemented; see class docs).
    virtual void loadFrm(int ifrm, TrajBlock *pTB) override;

    // ---- Properties ----

private:
    int m_nSkip;

public:
    int getSkipNo() const { return m_nSkip; }
    /// nevery < 1 would divide by zero in the frame loop
    void setSkipNo(int n) { m_nSkip = (n < 1) ? 1 : n; }

private:
    /// File atom count (0 until the header is read).
    int m_natom;
};

}  // namespace mdtools

#endif
