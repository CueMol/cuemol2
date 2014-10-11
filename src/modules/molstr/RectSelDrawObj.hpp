// -*-Mode: C++;-*-
//
// RectSelDrawObj: drawing object for distance picker UI
//

#ifndef MOLSTR_RECTSEL_DRAWOBJ_HPP_INCLUDED
#define MOLSTR_RECTSEL_DRAWOBJ_HPP_INCLUDED

#include "molstr.hpp"

#include <qsys/DrawObj.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>

class RectSelDrawObj_wrap;

namespace molstr {

using qlib::Vector4D;
using gfx::ColorPtr;
using gfx::DisplayContext;

class MOLSTR_API RectSelDrawObj : public qsys::DrawObj
{
  MC_SCRIPTABLE;

  friend class ::RectSelDrawObj_wrap;
  
private:
  typedef qsys::DrawObj super_t;

  ColorPtr m_color, m_colorPaint;

  int m_nStartX, m_nStartY;
  int m_nEndX, m_nEndY;
  //int m_nWidth, m_nHeight;

  bool m_bStart;

public:
  RectSelDrawObj();
  virtual ~RectSelDrawObj();

  virtual void display(DisplayContext *pdc);
  virtual void display2D(DisplayContext *pdc);

  virtual void setEnabled(bool f);
  
  void start(int x, int y);
  void move(int x, int y);
  void end();

  int getLeft() const {
    return (m_nStartX<m_nEndX)?m_nStartX:m_nEndX;
  }
  int getTop() const {
    return (m_nStartY<m_nEndY)?m_nStartY:m_nEndY;
  }
  int getWidth() const {
    return qlib::abs(m_nStartX-m_nEndX);
  }
  int getHeight() const {
    return qlib::abs(m_nStartY-m_nEndY);
  }
};  

}

#endif

