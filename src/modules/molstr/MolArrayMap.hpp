// -*-Mode: C++;-*-
//
// Generate mapping from MolCoord's MolAtom to linear array of atom positions
//

#ifndef MOL_TO_ARRAY_HPP_INCLUDED_
#define MOL_TO_ARRAY_HPP_INCLUDED_

#include "molstr.hpp"
#include <qlib/Array.hpp>

#include "MolAtom.hpp"
#include "Selection.hpp"

namespace molstr {

  struct MOLSTR_API MolArrayMapElem
  {
    LString chain;
    int resid;
    LString atom;
    MolAtomPtr pA;

    struct less_fcn : std::binary_function <MolArrayMapElem, MolArrayMapElem, bool> {
      bool operator() (const MolArrayMapElem &x, const MolArrayMapElem &y) const;
    };
  };

  ///////////////////////////////

  class MOLSTR_API MolArrayMap
  {
  private:
    // typedef std::set<MolArrayMapElem, MolArrayMapElem::less_fcn> data_t;
    typedef std::map<MolArrayMapElem, int, MolArrayMapElem::less_fcn> data_t;
    
    data_t m_data;

  private:
    void setupIndex();
    
  public:
    typedef data_t::const_iterator const_iterator;
    typedef data_t::size_type size_type;

    const_iterator begin() const { return m_data.begin(); }
    const_iterator end() const { return m_data.end(); }
    size_type size() const { return m_data.size(); }

    int getIndex(const MolArrayMapElem &key);

    void setup(MolCoordPtr pRefMol, const SelectionPtr pRefSel);
    void setup(MolCoordPtr pRefMol);
    void convertd(qlib::Array<double> &array);
    void convertf(qlib::Array<float> &array);
    void convertID(std::vector<int> &array);
  };

}

#endif

