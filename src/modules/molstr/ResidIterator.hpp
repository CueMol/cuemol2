// -*-Mode: C++;-*-
//
// ResidIterator : residue iterator class
//
// $Id: ResidIterator.hpp,v 1.3 2009/02/25 12:27:43 rishitani Exp $

#ifndef MOLSTR_RESIDUE_ITERATOR_HPP_INCLUDED
#define MOLSTR_RESIDUE_ITERATOR_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "Selection.hpp"

namespace molstr {


  class MOLSTR_API ResidIterator : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    /// target mol object
    MolCoordPtr m_pTarg;

    /// target selection
    SelectionPtr m_pSel;

    MolCoord::ChainIter m_citer;

    MolChain::ResidCursor m_riter;
    MolChain::ResidCursor2 m_riter2; 

    bool m_bIndOrder;
    
  public:

    /// construct iterator pointing to nothing
    ResidIterator();

    /// construct iterator for the all part of the mol pmol
    ResidIterator(MolCoordPtr pmol);

    /// construct iterator for part of pmol selected by psel
    ResidIterator(MolCoordPtr pmol, SelectionPtr psel);
  
    ~ResidIterator();

    //////////

    void setTarget(MolCoordPtr pmol);
    MolCoordPtr getTarget() const;

    void setSelection(SelectionPtr pmol);
    SelectionPtr getSelection() const;

    void setIndOrder(bool b) { m_bIndOrder = b; }
    bool getIndOrder() const { return m_bIndOrder; }
    
    //////////

    // cursor type interface
    void first() {
      if (m_bIndOrder)
        first2();
      else
        first1();
    }
    void next() {
      if (m_bIndOrder)
        next2();
      else
        next1();
    }
    bool hasMore() {
      if (m_bIndOrder)
        return hasMore2();
      else
        return hasMore1();
    }
    MolResiduePtr get() {
      if (m_bIndOrder)
        return get2();
      else
        return get1();
    }
  
  private:
  
    // Old Definition-ordered iteration impl

    void first1();
    void next1();
    bool hasMore1();
    MolResiduePtr get1();

    // ResIndex-ordered iteration impl

    void first2();
    void next2();
    bool hasMore2();
    MolResiduePtr get2();

  };

}

#endif // RESIDUE_ITERATOR_H__
