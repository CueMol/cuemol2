//
// Molecular visualization module
//  module loader/common impl
//
// $Id: molvis.cpp,v 1.11 2010/11/07 11:46:48 rishitani Exp $
//

#include <common.h>

#include "molvis.hpp"
#include "BallStickRenderer.hpp"
#include "AnIsoURenderer.hpp"
//#include "CPKRenderer.hpp"
#include "CPK2Renderer.hpp"
#include "SplineRenderer.hpp"
#include "TubeRenderer.hpp"
#include "RibbonRenderer.hpp"
#include "NARenderer.hpp"
#include "AtomIntrRenderer.hpp"
#include "Ribbon2Renderer.hpp"
#include "DisoRenderer.hpp"

#ifdef USE_OPENGL
#  include "Spline2RendGLSL.hpp"
#  include "GLSLTube2Renderer.hpp"
#else
#  include "Spline2Renderer.hpp"
#  include "Tube2Renderer.hpp"
#endif

#include "Tube2Renderer.hpp"


extern void molvis_regClasses();
extern void molvis_unregClasses();

#include <qsys/RendererFactory.hpp>
using qsys::RendererFactory;

namespace molvis {

bool init()
{
  molvis_regClasses();
  
  RendererFactory *pRF = RendererFactory::getInstance();
  pRF->regist<BallStickRenderer>();
  pRF->regist<AnIsoURenderer>();
  // pRF->regist<CPKRenderer>();
  pRF->regist<CPK2Renderer>();
  pRF->regist<SplineRenderer>();
  pRF->regist<TubeRenderer>();
  pRF->regist<RibbonRenderer>();
  pRF->regist<NARenderer>();
  pRF->regist<AtomIntrRenderer>();
  pRF->regist<Ribbon2Renderer>();
  pRF->regist<DisoRenderer>();

#ifdef USE_OPENGL
  pRF->regist<Spline2RendGLSL>();
  pRF->regist<GLSLTube2Renderer>();
#else
  pRF->regist<Spline2Renderer>();
  pRF->regist<Tube2Renderer>();
#endif

  MB_DPRINTLN("molvis init: OK");
  return true;
}

void fini()
{
  // PDBFileReader::unregClass();
  // molvis_unregClasses();
  
  MB_DPRINTLN("molvis fini: OK");
}

}
