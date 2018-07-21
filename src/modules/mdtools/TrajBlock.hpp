// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#ifndef MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED
#define MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED

#include "mdtools.hpp"
#include <qlib/Array.hpp>

#include <qsys/Object.hpp>
#include <qsys/ObjReader.hpp>

namespace mdtools {

  class TrajBlock;

  class MDTOOLS_API TrajBlockReader : public qsys::ObjReader
  {
    typedef qsys::ObjReader super_t;

  public:
    TrajBlockReader() : super_t(), m_bLazyLoad(false), m_nTrajUID(qlib::invalid_uid) {}

    /// Lazy load interface: Load specific block / frame (ifrm) from the stream
    virtual void loadFrm(int ifrm, TrajBlock *pTB) =0;

  private:
    bool m_bLazyLoad;

  public:
    void setLazyLoad(bool b) { m_bLazyLoad = b; }
    bool isLazyLoad() const { return m_bLazyLoad; }

  private:
    qlib::uid_t m_nTrajUID;
    
  public:
    qlib::uid_t getTargTrajUID() const { return m_nTrajUID; }
    void setTargTrajUID(qlib::uid_t uid) { m_nTrajUID = uid; }
    
    TrajectoryPtr getTargTraj() const;
  };

  MC_DECL_SCRSP(TrajBlockReader);
  
  ///////////////////////

  class MDTOOLS_API TrajBlock : public qsys::Object
  {
    MC_SCRIPTABLE;

  private:
    // LString m_name;
    // LString m_src;
    // LString m_altsrc;
    // LString m_srctype;
    
    //typedef std::vector<float> PosArray;
    typedef qlib::Array<qfloat32> PosArray;

    typedef qlib::Array<PosArray *> data_t;

    /// coordinates array (m_nCrds*m_nSize)
    data_t m_data;
    
    /// start frame index of this block
    int m_nIndex;

    /// number of coordinates per frame
    int m_nCrds;

    /// number of frames in this block
    int m_nSize;
    
  public:
    /// Size of cell size (symm matrix)
    static const int CELL_SIZE = 6;

  private:
    /// Cell dimension array (CELL_SIZE*m_nSize)
    typedef std::vector<float> CellArray;

    CellArray m_cells;

  public:
    /// default ctor
    TrajBlock();
    
    /// dtor
    virtual ~TrajBlock();
    
    /// Allocate coord array (natom x nsize frames)
    void allocate(int natom, int nsize);

    void clear();

    /// get coordinate array pointer of the specified frame
    qfloat32 *getCrdArray(int ifrm)
    {
      MB_ASSERT(0<=ifrm);
      MB_ASSERT(ifrm<m_nSize);

      PosArray *p = m_data[ifrm];
      return &(*p)[0];
    }
    
    void setStartIndex(int n) {
      m_nIndex = n;
    }
    int getStartIndex() const {
      return m_nIndex;
    }

    
    int getSize() const {
      return m_nSize;
    }

    int getCrdSize() const {
      return m_nCrds;
    }

    /// get cell dimension array
    qfloat32 *getCellArray(int ifrm=0)
    {
      MB_ASSERT(0<=ifrm);
      MB_ASSERT(ifrm<m_nSize);

      return &m_cells[ifrm*CELL_SIZE];
    }

  private:
    /// Parent trajectory object UID
    /// This prop is 0 (invalid) if this block is not belong to any trajectory
    qlib::uid_t m_nTrajUID;
    
  public:
    void setTrajUID(qlib::uid_t traj_uid) {
      m_nTrajUID = traj_uid;
    }

    qlib::uid_t getTrajUID() const {
      return m_nTrajUID;
    }

  private:

    /// coordinates availability flag
    std::vector<bool> m_flags;

    TrajBlockReaderPtr m_pReader;

  public:

    void setTrajLoader(const TrajBlockReaderPtr &preader) {
      m_pReader = preader;
    }

    void setLoaded(int ifrm, bool b)
    {
      m_flags[ifrm] = b;
    }

    bool isLoaded(int ifrm) const
    {
      return m_flags[ifrm];
    }

    bool isAllLoaded() const;

    void load(int ifrm);

  };

}

#endif

