// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#ifndef MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED
#define MDTOOLS_TRAJ_BLOCK_HPP_INCLUDED

#include "mdtools.hpp"
#include <qlib/Array.hpp>

#include <qsys/Object.hpp>

namespace mdtools {

  class TrajBlock : public qsys::Object
  {
    MC_SCRIPTABLE;

  private:
    // LString m_name;
    // LString m_src;
    // LString m_altsrc;
    // LString m_srctype;
    
    typedef std::vector<float> PosArray;

    /// coordinates array (m_nCrds*m_nSize)
    PosArray m_data;
    
    /// start frame index of this block
    int m_nIndex;

    /// number of coordinates per frame
    int m_nCrds;

    /// number of frames in this block
    int m_nSize;
    
  public:
    /// default ctor
    TrajBlock();
    
    /// dtor
    virtual ~TrajBlock();
    
    /// Allocate coord array (natom x nsize frames)
    void allocate(int natom, int nsize);

    /// get coordinate array pointer of the specified frame
    qfloat32 *getCrdArray(int ifrm) {
      MB_ASSERT(0<=ifrm);
      MB_ASSERT(ifrm<m_nSize);
      const int ind = m_nCrds * ifrm;
      MB_ASSERT(ind<m_data.size());
      return &m_data[ind];
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

  };

}

#endif

