// -*-Mode: C++;-*-
//
//  Color Lookup Table
//

#ifndef COLOR_TABLE_HPP_INCLUDED_
#define COLOR_TABLE_HPP_INCLUDED_

#include "AbstractColor.hpp"
#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/Utils.hpp>

namespace gfx {

using qlib::LString;
using qlib::Vector4D;

/// Color lookup table
class GFX_API ColorTable
{

public:

  /// Internal color data structure (supporting gradient color between two clut entries)
  class IntColor {
  public:
    /// Index for the internal CLUT
    short cid1;

    /// Index for the internal CLUT. Valid only for gradient color.
    short cid2;
    
    /// gradient param.
    unsigned char rho;
    
    //
    
    double getRhoF() const { return double(rho)/255.0; }
    void setRhoF(double r) { rho = ColorTable::convRho(r); }
    int getRhoI() const { return rho; }
    void setRhoI(unsigned char r) { rho = r; }

    bool equals(const IntColor &arg) const {
      if (cid2<0 && arg.cid2<0) {
        // comp of solid colors
        return cid1==arg.cid1;
      }
      else if (cid2>=0 && arg.cid2>=0) {
        // comp of gradient colors
        return ( cid1==arg.cid1 && cid2==arg.cid2 && rho==arg.rho );
      }

      return false;
    }

    bool isGrad() const {
      return (cid2<0)?false:true;
    }
  };

  typedef IntColor elem_t;

  /// Comparator of IntColor data (this sorts IntColor by clut index)
  struct IntColorComp {
    bool operator() (const elem_t &p1, const elem_t &p2) const {
      if (p1.cid1<p2.cid1)
        return true;
      else if (p1.cid1>p2.cid1)
        return false;
      // p1.cid1==p2.cid1
      if (p1.cid2<p2.cid2)
        return true;
      return false;
    }
  };
    
private:
  //////////////////////////////////////////////////////////////
  // Color-lookup table (CLUT) implementation

  struct ClutElem {
    /// 32-bit RGBA color code
    unsigned int m_code;
    /// material name
    LString m_mat;

    ClutElem(unsigned int ccode, const LString &mat)
         : m_code(ccode), m_mat(mat)
    {
    }

    bool equals(const ClutElem &p1) const {
      return (m_code==p1.m_code &&
              m_mat==p1.m_mat);
    }
  };

  typedef std::vector<ClutElem> clut_t;

  clut_t m_clut;

  /// default alpha value
  double m_defAlpha;

  //////////////////////////////////////////////////////////////

public:
  ColorTable() 
       : m_defAlpha(1.0)
  {
  }

public:

  int size() const { return m_clut.size(); } // m_nClutTop; }

  elem_t newColor(const ColorPtr &pCol, const LString &mtr, qlib::uid_t nSceneID = qlib::invalid_uid);

  static inline
  unsigned char convRho(double rho, bool inv=false) {
    double tr = qlib::trunc(rho, 0.0, 1.0);
    if (inv)
      tr = 1.0-tr;
    return (unsigned char) (tr*255.0+0.5);
  }

  //void setDefaultAlpha(double f) {
  //m_defAlpha = f;
  //}

private:
  int clutNewColorImpl(const ColorPtr &pCol, const LString &mtr, qlib::uid_t nSceneID);

public:  

  int import(const ColorTable &src);

  bool getColor(const elem_t & id, ColorPtr &rc) const;
  bool getMaterial(const elem_t & id, LString &rc) const;
    
  bool getRGBAByteColor(const elem_t &id, unsigned char *pcols) const;
  bool getRGBAVecColor(const elem_t &id, Vector4D &vec) const;

public:
  typedef std::map<IntColor, int, IntColorComp> grads_type;
  grads_type m_grads;
  
  /// Build the gradient table
  void appendGradient(const IntColor &cind) {
    m_grads.insert(grads_type::value_type(cind, 0));
  }

  /// Assign index to the gradient table
  void indexGradients() {
    grads_type::iterator gmi = m_grads.begin();
    int i;
    for (i=0 ; gmi!=m_grads.end(); ++gmi, ++i) {
      gmi->second = i;
    }    
  }

  /// Convert gradient color to gradient index
  int getGradIndex(const IntColor &cind) const {
    grads_type::const_iterator gmi = m_grads.find(cind);
    if (gmi==m_grads.end()) return -1;
    return gmi->second;
  }

  const IntColor *findGradByIndex(int gind) const {
    BOOST_FOREACH(const grads_type::value_type &entry, m_grads) {
      if (entry.second==gind)
        return &entry.first;
    }
    return NULL;
  }
  
};

} // namespace gfx

#endif // COLOR_TABLE_HPP_INCLUDED_

