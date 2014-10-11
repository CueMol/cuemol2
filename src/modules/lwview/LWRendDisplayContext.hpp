// -*-Mode: C++;-*-
//
// Display context for light-weight renderer generation
//

#ifndef LWREND_DISPLAY_CONTEXT_HPP_INCLUDED__
#define LWREND_DISPLAY_CONTEXT_HPP_INCLUDED__

#include "lwview.hpp"

#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>
#include <modules/rendering/RendIntData.hpp>
#include <modules/rendering/FileDisplayContext.hpp>
#include <modules/molstr/MolCoord.hpp>

namespace lwview {

  using render::RendIntData;
  class LWRenderer;

  class LWRendDisplayContext : public render::FileDisplayContext
  {
  private:
    typedef render::FileDisplayContext super_t;

    typedef qlib::MapPtrTable<RendIntData> IntDataMap;

    /// IntData table
    IntDataMap m_data;

    /// pixel data
    struct PixelData
    {
      Vector4D pos;
      gfx::ColorPtr color;
      gfx::PixelBuffer *pPixBuf;
    };

    std::deque<PixelData> m_pixdat;

  public:
    LWRendDisplayContext();
    virtual ~LWRendDisplayContext();

    ///////////////////////////////

    void startRender();
    void endRender();

    virtual void startSection(const LString &section_name);
    virtual void endSection();

    void drawPixels(const Vector4D &pos,
                    const gfx::PixelBuffer &data,
                    const gfx::ColorPtr &col);

    void drawString(const Vector4D &pos,
                    const qlib::LString &str);

    ///////////////////////////////
    // hittest support

    /// hittest indices
    std::deque<int> m_hitIndices;
    
    virtual void startHit(qlib::uid_t rend_uid);
    virtual void endHit();
    virtual void drawPointHit(int nid, const Vector4D &pos);

    ///////////////////////////////
    // Implementation

    void init(LWRenderer *pRend, LWObject *pObj);

  private:
    LWRenderer *m_pRend;
    LWObject *m_pObj;
    molstr::MolCoord *m_pMol;

    void writeObject(RendIntData *pDat);

    void writeLines(RendIntData *pDat);
    void writeDots(RendIntData *pDat);
    void writeMeshes(RendIntData *pDat);
    void writePixelData();

    static inline
    quint32 mulAlpha(quint32 cc, int calpha) {
      if (calpha>=255)
	return cc;
      qbyte r = gfx::getRCode(cc);
      qbyte g = gfx::getGCode(cc);
      qbyte b = gfx::getBCode(cc);
      qbyte a = gfx::getACode(cc);
      a = qbyte( int(a)*calpha );
      return gfx::makeRGBACode(r,g,b,a);
    }

    /////

    typedef std::deque<gfx::DrawElem *> DrawElemList;

    /// DrawElem list to build
    DrawElemList m_deList;

    void appendDrawElem(gfx::DrawElem *pVary) {
      m_deList.push_back(pVary);
    }
    
    void writeMesh(RendIntData *pDat, render::Mesh &mesh);

  };

}

#endif


