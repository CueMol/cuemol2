// -*-Mode: C++;-*-
//
// Residue index (with inscode)
//

#ifndef MOLSTR_RESID_IND_H__
#define MOLSTR_RESID_IND_H__

#include <qlib/RangeSet.hpp>
#include <qlib/MapTable.hpp>

namespace molstr {

  struct MOLSTR_API ResidIndex : public std::pair<int, char>
  {
    ResidIndex() : std::pair<int, char>(0, '\0') {}
    ResidIndex(int index) : std::pair<int, char>(index, '\0') {}
    ResidIndex(int index, char insc) : std::pair<int, char>(index, insc) {}
    //operator int() const { return std::pair<int, char>::first; }
    //operator int&() { return std::pair<int, char>::first; }
    int toInt() const { return std::pair<int, char>::first; }
    qlib::LString toString() const;
    static ResidIndex fromString(const qlib::LString &stridx);
    //const char *c_str() const { return toString().c_str(); }
  };

  inline bool operator<(const ResidIndex &ix, const ResidIndex &iy)
  {
    if (ix.first<iy.first)
      return true;
    else if (ix.first>iy.first)
      return false;
    return ix.second < iy.second;
  }

  inline bool operator==(const ResidIndex &ix, const ResidIndex &iy)
  {
    return (ix.first==iy.first) && (ix.second == iy.second);
  }

  //////////////////////////

  class ResidSet : public qlib::MapTable< qlib::RangeSet<int> >
  {
    typedef qlib::MapTable< qlib::RangeSet<int> > super_t;
    
  public:
    ResidSet() {}
    ~ResidSet() {}
    
    inline void append(char ch, int nst, int nen)
    {
      append(qlib::LString(ch), nst, nen);
    }
    
    void append(const qlib::LString &key, const ResidIndex &nst, const ResidIndex &nen)
    {
      super_t::iterator iter = super_t::find(key);
      if (iter==super_t::end()) {
        mapped_type val(nst.toInt(), nen.toInt());
        set(key, val);
      }
      else {
        iter->second.append(nst.toInt(), nen.toInt());
      }
    }
    
    /////

    inline void remove(char ch, int nst, int nen)
    {
      remove(qlib::LString(ch), nst, nen);
    }

    void remove(const qlib::LString &key, const ResidIndex &nst, const ResidIndex &nen)
    {
      super_t::iterator iter = super_t::find(key);
      if (iter!=super_t::end()) {
        iter->second.remove(nst.toInt(), nen.toInt());
      }
    }

  };

}

#endif
