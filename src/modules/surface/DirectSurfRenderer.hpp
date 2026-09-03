// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer (EDTSurf mesh builder)
//

#ifndef DIRECT_SURF_RENDERER_HPP_INCLUDED
#define DIRECT_SURF_RENDERER_HPP_INCLUDED

#include "DirectSurfRendererBase.hpp"

class DirectSurfRenderer_wrap;

namespace surface {

  /////////////////////////////////
  // Direct molecular surface renderer

  class DirectSurfRenderer : public DirectSurfRendererBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::DirectSurfRenderer_wrap;

    typedef DirectSurfRendererBase super_t;

  public:

    DirectSurfRenderer();
    ~DirectSurfRenderer() override;

    const char *getTypeName() const override;

    ////////////////////////////////
    // surface calculation algorithm

  private:
    int m_nSurfAlgor;

  public:
    enum {
      DS_EDTSURF,
      DS_MSMS
    };

    void setSurfAlgor(int n) {
      if (n==m_nSurfAlgor)
        return;
      m_nSurfAlgor = n;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    int getSurfAlgor() const { return m_nSurfAlgor; }

  protected:
    /// make mesh cache using EDTSurf algorithm
    void buildMeshCache() override;

  };

}

#endif // DIRECT_SURF_RENDERER_HPP_INCLUDED
