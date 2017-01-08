// -*-Mode: C++;-*-
//
//  OpenGL Hittest implementation
//
//  $Id: OglHitData.hpp,v 1.6 2011/03/13 08:52:17 rishitani Exp $

#ifndef OGL_HIT_DATA_HPP_INCLUDED
#define OGL_HIT_DATA_HPP_INCLUDED

#include <gfx/Hittest.hpp>
#include <qlib/Array.hpp>

namespace sysdep {

  using qlib::Array;

  ///
  ///  OpenGL dependent HitTest structure
  ///
  class OglHitData : public gfx::HitData
  {
  private:
	  typedef gfx::HitData super_t;

    /// Default hittest buffer size = 64 kbytes
    static const int DEFAULT_HITBUF_SIZE = (64*1024);

    /// Hittest buffer for OpenGL
    Array<GLuint> m_hitbuf;

  public:

    OglHitData()
         : m_hitbuf(), super_t()
    {
    }

    virtual ~OglHitData()
    {
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

    int searchNearest(const GLuint *pbuf, int size)
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

  };

}

#endif

