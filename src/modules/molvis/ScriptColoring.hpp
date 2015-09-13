// -*-Mode: C++;-*-
//
//  Script coloring class
//

#ifndef SCRIPT_COLORING_HPP_INCLUDED
#define SCRIPT_COLORING_HPP_INCLUDED

#include "molvis.hpp"

#include <gfx/AbstractColor.hpp>
#include <qsys/Renderer.hpp>
#include <modules/molstr/ColoringScheme.hpp>
#include <modules/molstr/Selection.hpp>

class ScriptColoring_wrap;
namespace jsbr {
  class Interp;
}

namespace molvis {

  using namespace molstr;
  using gfx::ColorPtr;
  using qsys::RendererPtr;

  class ScriptColoring : public molstr::ColoringScheme
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::ScriptColoring_wrap;

  private:
  
    typedef molstr::ColoringScheme super_t;

    //////////////////////
    // Workarea

    typedef std::map<int, ColorPtr> mapping_t;

    mapping_t m_map;

    MolCoordPtr m_pMol;
    RendererPtr m_pRend;

    jsbr::Interp *m_pInterp;

    bool m_bOK;

  public:
    ScriptColoring();
    virtual ~ScriptColoring();

    //////////////////////////////////////////////////////
    // Coloring interface implementation

    /// Initialization (called at the start of rendering)
    virtual bool start(MolCoordPtr pMol, Renderer *pRend);
  
    virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &color);
    // virtual bool getResidColor(MolResiduePtr pResid, ColorPtr &color);

    virtual void end();

  private:
    ColorPtr findAndFillCache(MolAtomPtr pAtom);

  private:
    ////////////////////////
    // Properties

    LString m_script;

  public:
    const LString &getScript() const { return m_script; }
    void setScript(const LString & s) {
      m_script = s;
    }

  public:
    ///////////////////////////////////////
    // Serialization / deserialization impl

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

  };

} // namespace molvis

#endif

