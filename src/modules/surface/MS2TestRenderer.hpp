// -*-Mode: C++;-*-
//
//  Molecular surface builder debug renderer
//
// $Id: MS2TestRenderer.hpp,v 1.1 2011/02/10 14:17:43 rishitani Exp $

#ifndef MOL_SURF_MS2TEST_RENDERER_HPP
#define MOL_SURF_MS2TEST_RENDERER_HPP

#include "surface.hpp"

#include <modules/molstr/MolRenderer.hpp>

namespace surface {

  using gfx::DisplayContext;
  using molstr::MolAtomPtr;

  /////////////////////////////////
  // Debug renderer class
  
  class MS2TestRenderer : public molstr::MolRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    
  public:
    
    MS2TestRenderer();
    virtual ~MS2TestRenderer();

    virtual const char *getTypeName() const;

    ///////////////////////////////////////////

    virtual void render(DisplayContext *pdl);

    virtual qlib::Vector4D getCenter() const;

    // Hittest implementation
    virtual bool isHitTestSupported() const;
    virtual void renderHit(DisplayContext *phl);

    ///////////////////////////////////////////

  };

}

#endif

