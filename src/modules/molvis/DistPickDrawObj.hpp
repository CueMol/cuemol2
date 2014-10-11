// -*-Mode: C++;-*-
//
// DistPickDrawObj: drawing object for distance picker UI
//

#ifndef MOLVIS_DISTPICK_DRAWOBJ_HPP_INCLUDED
#define MOLVIS_DISTPICK_DRAWOBJ_HPP_INCLUDED

#include "molvis.hpp"

#include <modules/molstr/molstr.hpp>
#include <qsys/DrawObj.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/SolidColor.hpp>

class DistPickDrawObj_wrap;

namespace molvis {

using molstr::MolCoordPtr;
using qlib::Vector4D;
using gfx::ColorPtr;
using gfx::DisplayContext;

class MOLVIS_API DistPickDrawObj : public qsys::DrawObj
{
  MC_SCRIPTABLE;

  friend class ::DistPickDrawObj_wrap;
  
private:
  typedef qsys::DrawObj super_t;
  typedef std::deque<Vector4D> data_t;
  data_t m_data;

  ColorPtr m_color;

  double m_width;

public:
  DistPickDrawObj();
  virtual ~DistPickDrawObj();

  virtual void display(DisplayContext *pdc);
  virtual void display2D(DisplayContext *pdc);

  virtual void setEnabled(bool f);
  
  void append(qlib::uid_t mol_id, int naid);

};  

}

#endif

