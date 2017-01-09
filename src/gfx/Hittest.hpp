// -*-Mode: C++;-*-
//
//  Generic Hittest class
//
//  $Id: Hittest.hpp,v 1.3 2011/01/09 15:12:22 rishitani Exp $

#ifndef GFX_HIT_TEST_HPP_
#define GFX_HIT_TEST_HPP_

#include "gfx.hpp"

namespace gfx {

  ///
  ///  Hittest data interface.
  ///  Interpretation of the hittest data 
  ///  depends on the renderer class, by which hittest was performed.
  ///  Implementation of RawHitData depends on the underlying Gfx implementation.
  ///
  class GFX_API RawHitData {
  public:
    virtual ~RawHitData();

    virtual int getDataSize(qlib::uid_t rend_id) const =0;
    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const =0;
  };


  ////////////////////////////////////////////

  class HittestContext;

  ///
  /// Common hittest data implementation
  ///
  class GFX_API HitData : public RawHitData
  {
  public:
    
    struct HitEntry {
      /// Renderer ID
      qlib::uid_t rend_id;
      /// Index of data for each entry
      std::deque<int> index;
      /// Hittest data (indexed by index)
      std::deque<int> data;
    };
    
    typedef std::map<qlib::uid_t, HitEntry *> data_t;
    data_t m_data;
    
    qlib::uid_t m_nNrRendID;
    
  public:

    HitData()
         : m_nNrRendID(qlib::invalid_uid)
    {
    }
    
    virtual ~HitData();
    
    void clear();

    HitEntry *getOrCreateEntry(qlib::uid_t rend_id);
    
    void createNearest(HittestContext *phc);
    void createAll(HittestContext *phc);

    //////////////////////////////////
    
    qlib::uid_t getNearestRendID() const {
      return m_nNrRendID;
    }
    
    int getRendSize() const {
      return m_data.size();
    }
    
    int getRendArray(qlib::uid_t *pBuf, int nBufSize) const;

    ///
    
    virtual int getDataSize(qlib::uid_t rend_id) const;
    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const;

  };

}

#endif



