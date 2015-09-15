//
// Residue range set object
//

#ifndef MOL_RESID_RANGE_SET_HPP_INCLUDED
#define MOL_RESID_RANGE_SET_HPP_INCLUDED

#include "molstr.hpp"

#include <qlib/RangeSet.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/mcutils.hpp>

#include "ResidIndex.hpp"

namespace molstr {

  using qlib::LString;

/*
  class MOLSTR_API RRSElem
  {
  public:
    LString chain;
    ResidIndex resid;

    RRSElem() {}
    RRSElem(const LString &aCh, int nResid) : chain(aCh), resid(nResid) {}
    RRSElem(const LString &aCh, const ResidIndex &aResid) : chain(aCh), resid(aResid) {}
  };

  inline bool operator<(const RRSElem &ix, const RRSElem &iy)
  {
    if (ix.chain<iy.chain)
      return true;
    else if (ix.chain>iy.chain)
      return false;
    return ix.resid < iy.resid;
  }

  inline bool operator==(const RRSElem &ix, const RRSElem &iy)
  {
    return (ix.chain==iy.chain) && (ix.resid == iy.resid);
  }
  
  /////////////////////////////////////////////////////////
*/

  class MOLSTR_API ResidRangeSet : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  public:
    typedef qlib::RangeSet<ResidIndex> elem_type;
    typedef qlib::MapPtrTable<elem_type> data_type;

    typedef data_type::const_iterator const_iterator;

  private:
    data_type m_data;

  public:
    const_iterator begin() const { return m_data.begin(); }
    const_iterator end() const { return m_data.end(); }

  public:
    /// default constructor
    ResidRangeSet()
    {
    }

    /// copy constructor
    ResidRangeSet(const ResidRangeSet &arg)
    {
      copyFrom(arg);
    }

    /// destructor
    virtual ~ResidRangeSet();

    /// Assignment operator
    const ResidRangeSet &operator=(const ResidRangeSet &arg) {
      if(&arg!=this) {
        copyFrom(arg);
      }
      return *this;
    }

    //////////

    void clear() { m_data.clearAndDelete(); }

    void copyFrom(const ResidRangeSet &orig);

    void fromSel(MolCoordPtr pMol, SelectionPtr pSel);
    SelectionPtr toSel(MolCoordPtr pMol) const;

    void append(MolResiduePtr pRes);
    void append(MolCoordPtr pMol, SelectionPtr pSel);

    void remove(MolCoordPtr pMol, SelectionPtr pSel);
    bool contains(MolResiduePtr pRes) const;

    void dump() const;

    // virtual bool equals(const LScrRangeSet &arg) const;
    virtual bool isStrConv() const;
    virtual LString toString() const;

    virtual bool fromString(const LString &src);

    typedef boost::true_type has_fromString;
    static ResidRangeSet *fromStringS(const LString &src);
    
  private:
    LString toStringResid(const elem_type &range) const;

  };

}

#endif

