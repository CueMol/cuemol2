// -*-Mode: C++;-*-
//
// GROMACS TRR binary trajectory file reader
//

#ifndef TRR_TRAJECTORY_READER_HPP_
#define TRR_TRAJECTORY_READER_HPP_

#include "mdtools.hpp"

#include <qlib/mcutils.hpp>
#include <modules/molstr/molstr.hpp>

#include "TrajBlock.hpp"

namespace mdtools {

class Trajectory;
class XdrInStream;

///
/// GROMACS TRR binary trajectory reader (block-centric).
///
/// Reads one uncompressed TRR file into a single TrajBlock, mirroring the
/// DCDTrajReader flow (createDefaultObj() returns the block; the caller
/// attaches it, calls read(), then appends the block to the target
/// Trajectory). TRR stores single- or double-precision coordinates plus
/// optional velocities and forces; only the coordinates and the simulation box
/// are kept (velocities/forces are skipped). Coordinates are scaled nm ->
/// Angstrom.
///
/// TRR does not record the frame count and TRR frames are variable-length, so
/// frames are read eagerly and appended one at a time (TrajBlock::appendFrame).
/// Seek-based lazy loading is not implemented (develop's InStream has no
/// portable seek), so loadFrm() is unreachable.
///
class MDTOOLS_API TrrTrajReader : public TrajBlockReader
{
    MC_SCRIPTABLE;

    typedef TrajBlockReader super_t;

public:
    TrrTrajReader();
    virtual ~TrrTrajReader();

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
    /// File atom count (0 until the first frame header is read).
    int m_natom;
};

}  // namespace mdtools

#endif
