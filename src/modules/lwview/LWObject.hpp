// -*-Mode: C++;-*-
//
//  Light-weight object for viewer
//

#ifndef LW_OBJECT_HPP_INCLUDED_
#define LW_OBJECT_HPP_INCLUDED_

#include "lwview.hpp"
#include <qsys/Object.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/Array.hpp>

namespace gfx {
  class DrawElem;
}

namespace lwview {

  using qlib::Vector4D;
  class QdfLWObjWriter;
  class QdfLWObjReader;
  
  /// hittest data
  struct LWHitData
  {
    LWHitData()
         : m_bRend(true)
    {
    }

    LWHitData(const Vector4D &pos, const LString &msg)
         : m_sMsg(msg), m_vPos(pos), m_bRend(true)
    {
    }

    /// hittest message
    LString m_sMsg;

    /// position
    Vector4D m_vPos;

    /// rendered flag
    bool m_bRend;
  };

  ///
  ///  Light-weight object for generic viewer display
  ///
  class LWVIEW_API LWObject : public qsys::Object
  {
    MC_SCRIPTABLE;
    friend class QdfLWObjWriter;
    friend class QdfLWObjReader;

  private:

  public:
    /// default constructor
    LWObject();
    
    /// destructor
    virtual ~LWObject();

    /////

    void startBuild() {}

    void endBuild();

    ////////////////////////////////////////////
    // Hittest support

  public:
    typedef std::deque<LWHitData> TmpHitList;
    typedef qlib::Array<LWHitData> HitArray;
    typedef std::map<int,int> AidDataSet;

    /// register new hitdata (to build hitdata structure)
    int addPointHit(int nid, const Vector4D &pos, const LString &msg);
    
    /// access hittest data (for LWRenderer)
    bool getHitData(int index, LWHitData &hdat) {
      if (index<0||index>=m_hitdata.size())
        return false;
      hdat = m_hitdata[index];
      return true;
    }

  private:
    /// build the fixed size array of the hittest data
    void buildHitData();

    /// temporary hitdata list (for data building)
    TmpHitList m_tmpHitList;

    /// Atom ID set (for data building)
    AidDataSet m_aidDataSet;
    
    /// hittest data
    HitArray m_hitdata;

    ////////////////////////////////////////////
    // Data chunk serialization
    
  public:
    virtual bool isDataSrcWritable() const { return true; }
    virtual LString getDataChunkReaderName() const;
    virtual void writeDataChunkTo(qlib::LDom2OutStream &oos) const;
  };

}

#endif

