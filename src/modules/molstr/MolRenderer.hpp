// -*-Mode: C++;-*-
//
//  Superclass of molecular renderers
//
//  $Id: MolRenderer.hpp,v 1.17 2011/02/14 14:36:59 rishitani Exp $

#ifndef MOL_RENDERER_HPP_
#define MOL_RENDERER_HPP_

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/Vector4D.hpp>

#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>

#include "ElemSym.hpp"
#include "Selection.hpp"
#include "MolCoord.hpp"
#include "ColoringScheme.hpp"

namespace molstr {

  using qlib::Vector4D;
  using gfx::DisplayContext;

  /**
     Abstract class for molecular renderers
  */
  class MOLSTR_API MolRenderer : public qsys::DispListRenderer, public ColSchmHolder
  {
    MC_SCRIPTABLE;

  private:
    typedef qsys::DispListRenderer super_t;
    
    SelectionPtr m_pSel;

  public:

    MolRenderer();
    MolRenderer(const MolRenderer &r);
    virtual ~MolRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual qlib::Vector4D getCenter() const;
    virtual bool hasCenter() const;

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;

    virtual LString toString() const;

    virtual void propChanged(qlib::LPropEvent &ev);

    // check the MolCoord's coloring change
    virtual void objectChanged(qsys::ObjectEvent &ev);

    LString interpHit(const gfx::RawHitData &rhit);

    //////////////////////////////////////////////////////
    // MolRenderer interface (selection)

    // Set selection object
    //  (copy of the selection object is retained)
    virtual void setSelection(SelectionPtr pSel);
    
    // Get selection object
    virtual SelectionPtr getSelection() const;

    //////////////////////////////////////////////////////
    // Final methods

    MolCoordPtr getClientMol() const;

    /// make hittestresult JSON string for atom aid
    static LString interpHitAidImpl(MolAtomPtr pAtom);

    static ColorPtr evalMolColor(ColorPtr pCol, ColorPtr pCol2);

  };

}

#endif
