// -*-Mode: C++;-*-
//
//  OpenGL Hittest implementation
//
//  $Id: OglHitData.hpp,v 1.6 2011/03/13 08:52:17 rishitani Exp $

#ifndef OGL_HIT_DATA_HPP_INCLUDED_
#define OGL_HIT_DATA_HPP_INCLUDED_

#include <gfx/Hittest.hpp>
#include <qlib/Array.hpp>

namespace sysdep {

using qlib::Array;

///
///  OpenGL dependent HitTest structure
///
class GlHitData : public gfx::RawHitData
{
private:

  /// Default hittest buffer size = 64 kbytes
  static const int DEFAULT_HITBUF_SIZE = (64*1024);

  /// Hittest buffer for OpenGL
  Array<GLuint> m_hitbuf;

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

  GlHitData()
       : m_hitbuf(), m_nNrRendID(qlib::invalid_uid)
  {
    m_pCachedEntry = NULL;
  }

  virtual ~GlHitData()
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

  void setSelectBuffer(int asize = -1)
  {
    int nsize;
    if (asize>0)
      nsize = asize;
    else
      nsize = DEFAULT_HITBUF_SIZE;

    // Grow buffer if current size is smaller than requested
    const int cursize = m_hitbuf.size();
    if (cursize<nsize)
      m_hitbuf.resize(nsize);

    ::glSelectBuffer(m_hitbuf.size(), const_cast<GLuint *>(m_hitbuf.data()));
  }
  
  HitEntry *getOrCreateEntry(qlib::uid_t rend_id) {
    data_t::const_iterator iter = m_data.find(rend_id);
    if (iter==m_data.end()) {
      HitEntry *pRet = MB_NEW HitEntry();
      pRet->rend_id = rend_id;
      m_data.insert(data_t::value_type(rend_id, pRet));
      return pRet;
    }
    return iter->second;
  }

  /// Create single hitdata from nearest hit
  bool createFromGlBuf(int size) {
    m_pCachedEntry = NULL;
    const GLuint *pbuf = m_hitbuf.data();

    //m_nBias = 0;
    unsigned int i, pos =0;
    if (size<=0)
      return false;

    if (size>=2)
      pos = searchNearest(pbuf, size);

    const GLuint *ptr = pbuf;

    for (i=0; i<pos; i++) {
      GLuint names = *ptr; ptr++;
      // skip Z1, Z2
      ptr++; ptr++;
      for (unsigned int j=0; j<names; j++)
        ptr++;
    }

    GLuint names = *ptr; ptr++;
    MB_ASSERT(names>0);

    // skip Z1, Z2
    ptr++; ptr++;

    qlib::uid_t rend_id = qlib::uid_t(ptr[0]);
    HitEntry *pEnt = getOrCreateEntry(rend_id);
    
    // make index
    unsigned int ind = pEnt->data.size();
    pEnt->index.push_back(ind);

    // copy to data array
    for (i=1; i<names; ++i)
      pEnt->data.push_back(ptr[i]);

    m_nNrRendID = qlib::invalid_uid;
    return true;
  }

  /// Create multiple hitdata using all of the hittest data
  bool createAllFromGlBuf(unsigned int size) {
    m_pCachedEntry = NULL;
    const GLuint *pbuf = m_hitbuf.data();

    //int pos =0;
    if (size<=0)
      return false;

    const GLuint *ptr = pbuf;

    float d = 1.0E10;
    qlib::uid_t rend_id, nearest_id;

    for (unsigned int i=0; i<size; i++) {
      GLuint names = *ptr; ptr++;
      // // skip Z1, Z2
      // ptr++; ptr++;

      float z1 = (float) *ptr/0x7fffFFFF; ptr++;
      float z2 = (float) *ptr/0x7fffFFFF; ptr++;

      if (names>=1) {
        rend_id = qlib::uid_t(ptr[0]);
        HitEntry *pEnt = getOrCreateEntry(rend_id);

        // make index
        int ind = pEnt->data.size();
        pEnt->index.push_back(ind);

        // copy to data array
        for (unsigned int j=1; j<names; ++j)
          pEnt->data.push_back(ptr[j]);
      }
      
      const float midpt = (z1+z2)/2.0f;
      if (d>midpt) {
        nearest_id = rend_id;
        d = midpt;
      }

      //for (unsigned int j=0; j<names; j++)
      //ptr++;
      ptr += names;
    }

    m_nNrRendID = nearest_id;
    MB_DPRINTLN("Nearest rend ID: %d", m_nNrRendID);
    return true;
  }
  
  static int searchNearest(const GLuint *pbuf, int size)
  {
    int nearest = 0;
    float d = 1.0E10;
    const GLuint *ptr = pbuf;

    for (int i=0; i<size; i++) {
      GLuint names = *ptr; ptr++;
      float z1 = (float) *ptr/0x7fffFFFF; ptr++;
      float z2 = (float) *ptr/0x7fffFFFF; ptr++;
      const float midpt = (z1+z2)/2.0f;
      if (d>midpt) {
        nearest = i;
        d = midpt;
      }
      for (unsigned int j=0; j<names; j++) {
        int n = *ptr; ptr++;
      }
    }

    return nearest;
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

/*
  virtual bool getDataArray(qlib::uid_t rend_id, int *pBuf, int nBufSize) const
  {
    int depth = 0;
    data_t::const_iterator iter = m_data.find(rend_id);
    if (iter==m_data.end())
      return false;
    HitEntry *pEnt = iter->second;
    
    std::deque<int>::const_iterator biter = pEnt->index.begin();
    std::deque<int>::const_iterator eiter = pEnt->index.end();
    for (int i=0; i<nBufSize && biter!=eiter; ++i, ++biter) {
      int ii = *biter + depth;
      pBuf[i] = pEnt->data.at(ii);
    }
    
    return true;
  }
*/
  
};

}

#endif

