// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: MolSurfBuilder.hpp,v 1.2 2011/02/11 06:54:22 rishitani Exp $

#ifndef MOL_SURF_BUILDER_HPP_INCLUDED__
#define MOL_SURF_BUILDER_HPP_INCLUDED__

#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include <qlib/Vector4D.hpp>
#include <qlib/Array.hpp>

#include <molstr/molstr.hpp>
#include <molstr/BSPTree.hpp>

#include "SurfTgSet.hpp"
#include "MSAtom.hpp"

namespace gfx {
  class DisplayContext;
}

namespace surface {
  
  using qlib::Vector4D;
  using gfx::DisplayContext;
  using molstr::MolCoordPtr;
  using molstr::BSPTree;
  class RSEdge;
  class RSVert;
  
  class MolSurfBuilder
  {
  public:

    double m_rmax, m_rprobe;
    
    SurfTgSet m_tgset;
    
  private:
    MSAtomArray m_data;
    
    DisplayContext *m_pdl;
    
    BSPTree<int> m_tree;
    
  public:
    MolSurfBuilder() {}
    
    ~MolSurfBuilder();
    
    //////////////////////////////////////////////////////////
    // atom database access/query routines
    
    bool init(MolCoordPtr pmol);
    
    const MSAtomArray &getAtomArray() const { return m_data; }
    MSAtomArray &getAtomArray() { return m_data; }
    
    const MSAtom &getAtom(int i) const { return m_data[i]; }
    MSAtom &getAtom(int i) { return m_data[i]; }
    
    bool collChk(const Vector4D &pos, double rng);
    
    int findAround(std::vector<int> &ls, const Vector4D &pos, double rng) {
      return m_tree.findAround(pos, rng, ls);
    }
    
    void build();
    
    //////////////////////////////////////////////////////////
    // drawing utility routines for debugging

    void setDC(DisplayContext *pdl) { m_pdl = pdl; }

    DisplayContext *getDC() const { return m_pdl; }

    void drawDisk(const Vector4D &cen, const Vector4D &norm, double rad);

    void drawArc(const Vector4D &n, double rad, const Vector4D &cen,
                 const Vector4D &vst, double theta2);

    static inline
      Vector4D makenorm(const Vector4D &pos1,
                        const Vector4D &pos2,
                        const Vector4D &pos3) {
        const Vector4D v12 = pos2 - pos1;
        const Vector4D v23 = pos3 - pos2;
        Vector4D vn = v12.cross(v23);
        const double dnorm = vn.length();
        // if (dnorm<dtol) {
        //   throw error!!
        // }
        vn /= dnorm;
        return vn;
      }
    
  };
  

} // namespace surface

#endif // SURF_BUILDER_TEST

#endif

