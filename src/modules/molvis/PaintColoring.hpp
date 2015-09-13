// -*-Mode: C++;-*-
//
//  Paint coloring class
//

#ifndef PAINT_COLORING_HPP_INCLUDED
#define PAINT_COLORING_HPP_INCLUDED

#include "molvis.hpp"

#include <gfx/AbstractColor.hpp>
#include <qsys/qsys.hpp>
#include <modules/molstr/ColoringScheme.hpp>
#include <modules/molstr/Selection.hpp>

namespace molvis {

  using namespace molstr;
  using gfx::ColorPtr;

  class PaintColoring : public molstr::ColoringScheme
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:

    typedef molstr::ColoringScheme super_t;

    //////////////////////
    //  persistent properties

    // //MCINFO: LColor m_defaultColor => default
    // ColorPtr m_defaultColor;

    // //MCINFO: LColor m_maskColor => mask
    // ColorPtr m_maskColor;

    //////////////////////
    //  persistent workarea

    typedef std::pair<SelectionPtr,ColorPtr> PaintTuple;

    typedef std::deque<PaintTuple> ColorTab;
    ColorTab m_coltab;

  public:
    PaintColoring();
    virtual ~PaintColoring();

    //////////////////////////////////////////////////////
    // Coloring interface implementation

    virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &color);

    //////////////////////////////////////////////////////

    /// clear coloring table
    void clear();

    /// append selection-color pair
    void append(const SelectionPtr &psel, const ColorPtr &color);

    /// insert definition before the index
    void insertBefore(int nInsBef, const SelectionPtr &psel, const ColorPtr &color);

    int getSize() const { return m_coltab.size(); }
    ColorPtr getColorAt(int ind) const;
    SelectionPtr getSelAt(int ind) const;

    bool removeAt(int ind);
    bool changeAt(int ind, const SelectionPtr &psel, const ColorPtr &color);

    //////////////////////////////////////////////////////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

  private:

    //////////////////////////////////////////////////////
    // Implementation

    bool removeAtImpl(int ind);

    qsys::ScenePtr getScene() const;

  };

} // namespace molvis

#endif

