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
  ///  Raw hittest data class.
  ///  Interpretation of the raw hittest data 
  ///  depends on the renderer class, by which hittest was performed.
  ///  Implementation of RawHitData depends on the underlying Gfx implementation.
  ///
  class GFX_API RawHitData {
  public:
    virtual ~RawHitData() {}

    virtual int getDataSize(qlib::uid_t rend_id) const =0;
    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const =0;
  };

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
    
    mutable HitEntry *m_pCachedEntry;
    
  public:

    HitData()
         : m_nNrRendID(qlib::invalid_uid)
    {
      m_pCachedEntry = NULL;
    }
    
    virtual ~HitData()
    {
      clear();
    }
    
    void clear() {
      BOOST_FOREACH(const data_t::value_type &ee, m_data) {
        delete ee.second;
      }
      m_data.clear();
      m_nNrRendID = qlib::invalid_uid;
      m_pCachedEntry = NULL;
    }
    

    HitEntry *getOrCreateEntry(qlib::uid_t rend_id)
    {
      data_t::const_iterator iter = m_data.find(rend_id);
      if (iter==m_data.end()) {
        HitEntry *pRet = MB_NEW HitEntry();
        pRet->rend_id = rend_id;
        m_data.insert(data_t::value_type(rend_id, pRet));
        return pRet;
      }
      return iter->second;
    }
    
    //////////////////////////////////
    
    qlib::uid_t getNearestRendID() const {
      return m_nNrRendID;
    }
    
    int getRendSize() const {
      return m_data.size();
    }
    
    int getRendArray(qlib::uid_t *pBuf, int nBufSize) const {
      data_t::const_iterator biter = m_data.begin();
      data_t::const_iterator eiter = m_data.end();
      int i;
      for (i=0; i<nBufSize && biter!=eiter; ++i, ++biter)
        pBuf[i] = biter->first;
      
      return i;
    }
    ///
    
    virtual int getDataSize(qlib::uid_t rend_id) const {
      m_pCachedEntry = NULL;
      data_t::const_iterator iter = m_data.find(rend_id);
      if (iter==m_data.end())
        return 0;
      HitEntry *pEnt = iter->second;
      //return pEnt->intdata.size();
      return pEnt->index.size();
    }

    virtual int getDataAt(qlib::uid_t rend_id, int ii, int subii) const
    {
      HitEntry *pEnt;

      if (m_pCachedEntry!=NULL &&
          m_pCachedEntry->rend_id==rend_id) {
        pEnt = m_pCachedEntry;
      }
      else {
        data_t::const_iterator iter = m_data.find(rend_id);
        if (iter==m_data.end())
          return -1;
        m_pCachedEntry = pEnt = iter->second;
      }

      if (ii>=pEnt->index.size()) {
        MB_DPRINTLN("OglHit> rend ID %d; main index (%d) is out of bound", rend_id, ii);
        return -1;
      }

      int intn_start = pEnt->index.at(ii);
      int intn_end;
      if (ii<pEnt->index.size()-1)
        intn_end = pEnt->index.at(ii+1);
      else
        intn_end = pEnt->data.size();

      if (subii>=intn_end-intn_start) {
        MB_DPRINTLN("OglHit> rend ID %d; mainindex (%d), subindex(%d) is out of bound", rend_id, ii, subii);
        return -1;
      }

      return pEnt->data.at(intn_start+subii);
    }
  };

}

#endif



