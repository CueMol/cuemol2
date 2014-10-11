// -*-Mode: C++;-*-
//
// Selection : abstract interface for selection classes
//
// $Id: Selection.hpp,v 1.5 2009/11/07 09:47:26 rishitani Exp $

#ifndef MOL_SELECTION_H__
#define MOL_SELECTION_H__

#include "molstr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/mcutils.hpp>

namespace molstr {

  /**
     Abstract interface for selection classes
  */
  class MOLSTR_API Selection : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;

  public:

    /** selection ID returned by isSelectedXXX() method */
    enum {
      SEL_NONE,
      SEL_ALL,
      SEL_PART,
      SEL_UNKNOWN
    };
  
  public:
    /** default ctor */
    Selection() {}

    /** copy ctor */
    Selection(const Selection &) {}

    /** dtor */
    virtual ~Selection() {}

    virtual int isSelectedMol(MolCoordPtr pobj) =0;
    virtual int isSelectedChain(MolChainPtr pchain) =0;
    virtual int isSelectedResid(MolResiduePtr presid) =0;
    virtual bool isSelected(MolAtomPtr patom) =0;

    /**
       Returns this object represents empty selection or not.
       The reslut "true" means that selection is empty,
       but "false" doesn't guarantee "not empty".
       (If the calculation is time-consuming,
       this method just can return false.)
    */
    virtual bool isEmpty() const;

    virtual bool equals(Selection *pSel) const;

    virtual qlib::LString toString() const =0;

    typedef boost::true_type has_fromString;
    static Selection *fromStringS(const qlib::LString &src);
  };

}

#endif
