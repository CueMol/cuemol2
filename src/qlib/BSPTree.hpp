// -*-Mode: C++;-*-
//
// BSPTree
//

#ifndef QLIB_BSP_TREE_HPP_INCLUDED_
#define QLIB_BSP_TREE_HPP_INCLUDED_

#include "Array.hpp"
#include "Vector4D.hpp"

namespace qlib {

  using qlib::Vector4D;

  namespace detail {
    template <class _T>
    struct tuple_t
    {
      double pos[3];
      _T val;
    };

    template <class _T, int _dir>
    inline bool lessTuple(const tuple_t<_T> &val1, const tuple_t<_T> &val2)
    {
      return val1.pos[_dir] < val2.pos[_dir];
    }
  }

  template <class _T>
  class BSPTree
  {
  public:
    typedef detail::tuple_t<_T> tuple_t;
    typedef std::vector<tuple_t> data_t;

  private:
    struct Node
    {
      int imin, imax;
      int idir;
      double ddiv;
      Vector4D vmin, vmax;
      Node *pc1, *pc2;
    };

    /// Root node of the spacial-binary tree
    Node *m_pRoot;

    std::vector<tuple_t> m_data;

    // temporary index buffer
    mutable int m_ibx;
    mutable std::vector<int> m_ibuf;

    /// granuarity
    int m_ngrn;
    int m_nlvmax, m_nlv;

  public:

    BSPTree() : m_pRoot(NULL) {}
    ~BSPTree() { clear(); }

    //
    // BSP tree construction methods
    //

    void alloc(int nsize)
    {
      m_data.resize(nsize);
    }

    void setAt(int index, const Vector4D &pos, const _T &data)
    {
      m_data[index].pos[0] = pos.x();
      m_data[index].pos[1] = pos.y();
      m_data[index].pos[2] = pos.z();
      m_data[index].val = data;
    }

    void build()
    {
      Vector4D vmin, vmax;
      m_ngrn = 10;
      m_nlvmax = 1000000;
      m_nlv = 0;
      m_pRoot = MB_NEW Node;
      m_pRoot->imin = 0;
      m_pRoot->imax = m_data.size();
      calcBound(m_pRoot->imin, m_pRoot->imax,
                m_pRoot->vmin, m_pRoot->vmax);

      ++m_nlv;
      buildChild(m_pRoot);
      --m_nlv;
    }

    void clear()
    {
      if (m_pRoot!=NULL) {
        removeNodes(m_pRoot);
        m_pRoot = NULL;
        m_data.resize(0);
      }
    }

  private:

    bool buildChildHelper(Node *pnode)
    {
      int rnglo = pnode->imin;
      int rnghi = pnode->imax;
      int nrng = rnghi - rnglo;

      if (nrng<m_ngrn || m_nlv>m_nlvmax) {
        pnode->pc1 = NULL;
        pnode->pc2 = NULL;
        return false;
      }

      int ndiv = rnglo + nrng/2;

      const Vector4D &vmin = pnode->vmin;
      const Vector4D &vmax = pnode->vmax;
      Vector4D vrng = vmax-vmin;

      // make sort range
      typename data_t::iterator ist = m_data.begin();
      typename data_t::iterator ien = m_data.begin();
      ist += rnglo;
      ien += rnghi;

      Vector4D vmax_c1 = vmax;
      Vector4D vmin_c2 = vmin;

      int ndir;
      if (vrng.x()>vrng.y() && vrng.x()>vrng.z()) {
        ndir = 0;
        std::sort(ist, ien, detail::lessTuple<_T, 0> );
        pnode->ddiv = (m_data[ndiv].pos[ndir] + m_data[ndiv+1].pos[ndir])/2.0;
        vmax_c1.x() = pnode->ddiv;
        vmin_c2.x() = pnode->ddiv;
      }
      else if (vrng.y()>vrng.x() && vrng.y()>vrng.z()) {
        ndir = 1;
        std::sort(ist, ien, detail::lessTuple<_T, 1> );
        pnode->ddiv = (m_data[ndiv].pos[ndir] + m_data[ndiv+1].pos[ndir])/2.0;
        vmax_c1.y() = pnode->ddiv;
        vmin_c2.y() = pnode->ddiv;
      }
      else {
        ndir = 2;
        std::sort(ist, ien, detail::lessTuple<_T, 2> );
        pnode->ddiv = (m_data[ndiv].pos[ndir] + m_data[ndiv+1].pos[ndir])/2.0;
        vmax_c1.z() = pnode->ddiv;
        vmin_c2.z() = pnode->ddiv;
      }

#if 0
      MB_DPRINTLN("==========");
      MB_DPRINTLN("division dir=%d at %f", ndir, pnode->ddiv);
      for (int jj=rnglo; jj<rnghi; ++jj) {
        MB_DPRINTLN("%d: (%2.5f, %2.5f, %2.5f) %d", jj,
                    m_data[jj].pos[0], m_data[jj].pos[1], m_data[jj].pos[2],
                    (int)m_data[jj].val);
        if (jj==ndiv)
          MB_DPRINTLN("----------");
      }
      MB_DPRINTLN("==========");
#endif

#if 0
      MB_DPRINTLN("LV%d division dir=%d at %f", m_nlv, ndir, pnode->ddiv);
      MB_DPRINTLN("(%2.5f, %2.5f, %2.5f)-(%2.5f, %2.5f, %2.5f)",
                  vmin.x(), vmin.y(), vmin.z(), vmax.x(), vmax.y(), vmax.z());
      MB_DPRINTLN("--> (%2.5f, %2.5f, %2.5f)-(%2.5f, %2.5f, %2.5f)",
                  vmin.x(), vmin.y(), vmin.z(), vmax_c1.x(), vmax_c1.y(), vmax_c1.z());
      MB_DPRINTLN("--> (%2.5f, %2.5f, %2.5f)-(%2.5f, %2.5f, %2.5f)",
                  vmin_c2.x(), vmin_c2.y(), vmin_c2.z(), vmax.x(), vmax.y(), vmax.z());
#endif

      pnode->idir = ndir;
      pnode->pc1 = MB_NEW Node;
      pnode->pc2 = MB_NEW Node;

      // setup child nodes
      pnode->pc1->imin = rnglo;
      pnode->pc1->imax = ndiv+1;
      pnode->pc1->vmin = vmin;
      pnode->pc1->vmax = vmax_c1;

      pnode->pc2->imin = ndiv+1;
      pnode->pc2->imax = rnghi;
      pnode->pc2->vmin = vmin_c2;
      pnode->pc2->vmax = vmax;

      return true;
    }

    void buildChild(Node *pnode)
    {
      if (!buildChildHelper(pnode))
        return;

      ++m_nlv;
      buildChild(pnode->pc1);
      buildChild(pnode->pc2);
      --m_nlv;
    }

    void calcBound(int rnglo, int rnghi, Vector4D &vmin, Vector4D &vmax)
    {
      int i;
      vmin.x() = vmin.y() = vmin.z() = 1.0e100;
      vmax.x() = vmax.y() = vmax.z() = -1.0e100;
      for (i=rnglo; i<rnghi; ++i) {
        if (m_data[i].pos[0]<vmin.x())
          vmin.x() = m_data[i].pos[0];
        if (m_data[i].pos[1]<vmin.y())
          vmin.y() = m_data[i].pos[1];
        if (m_data[i].pos[2]<vmin.z())
          vmin.z() = m_data[i].pos[2];

        if (vmax.x()<m_data[i].pos[0])
          vmax.x() = m_data[i].pos[0];
        if (vmax.y()<m_data[i].pos[1])
          vmax.y() = m_data[i].pos[1];
        if (vmax.z()<m_data[i].pos[2])
          vmax.z() = m_data[i].pos[2];
      }
    }

    void removeNodes(Node *p)
    {
      if (p!=NULL) {
        if (p->pc1!=NULL) {
          removeNodes(p->pc1);
          p->pc1 = NULL;
        }
        if (p->pc2!=NULL) {
          removeNodes(p->pc2);
          p->pc2 = NULL;
        }
        delete p;
      }
    }

  public:

    // double m_eps;

    //
    // search methods
    //

    /**
    Find points around the position "pos" in the radius "r".
     */
    int findAround(const Vector4D &pos, double r,
                   std::vector<_T> &rvec) const
    {
      // make search cube (with 2r)
      Vector4D vfmin(pos), vfmax(pos);
      vfmin.x() -= r;
      vfmin.y() -= r;
      vfmin.z() -= r;
      vfmax.x() += r;
      vfmax.y() += r;
      vfmax.z() += r;

      //MB_DPRINTLN("ChkBox %s--%s", vfmin.toString().c_str(), vfmax.toString().c_str());

      if (m_ibuf.size()<m_data.size())
        m_ibuf.resize(m_data.size());
      m_ibx = 0;
      findBoxImpl(m_pRoot, vfmin, vfmax);
      if (m_ibx==0) return 0;

      if (rvec.size()<m_ibuf.size())
        rvec.resize(m_ibuf.size());

      Vector4D vt;
      int i, jj, k;
      for (i=0, k=0; i<m_ibx; ++i) {
        jj = m_ibuf[i];
        vt.x() = m_data[jj].pos[0];
        vt.y() = m_data[jj].pos[1];
        vt.z() = m_data[jj].pos[2];
        //MB_DPRINTLN("chk %s <--> %s", pos.toString().c_str(), vt.toString().c_str());
        if (isNearPos(pos, vt, r)) {
          //rlist.push_back(m_data[jj].val);
          rvec[k] = m_data[jj].val;
          ++k;
          //MB_DPRINTLN("OK pos %d ", jj);
        }
        else {
          //MB_DPRINTLN("XX pos %d rej", jj);
        }
      }

      return k;
      //return rlist.size()>0;
    }

    /**
    Check if there are any points around the position "pos"
    in the radius "r".
     */
    bool collChk(const Vector4D &pos, double r) const
    {
      // make search cube (with 2r)
      Vector4D vfmin(pos), vfmax(pos);
      vfmin.x() -= r;
      vfmin.y() -= r;
      vfmin.z() -= r;
      vfmax.x() += r;
      vfmax.y() += r;
      vfmax.z() += r;

      if (m_ibuf.size()<m_data.size())
        m_ibuf.resize(m_data.size());
      m_ibx = 0;
      findBoxImpl(m_pRoot, vfmin, vfmax);
      if (m_ibx==0) return 0;

      Vector4D vt;
      int i, jj, k;
      for (i=0, k=0; i<m_ibx; ++i) {
        jj = m_ibuf[i];
        vt.x() = m_data[jj].pos[0];
        vt.y() = m_data[jj].pos[1];
        vt.z() = m_data[jj].pos[2];
        if (isNearPos(pos, vt, r))
          return true;
      }

      return false;
    }

  private:
    inline
      bool isNearPos(const Vector4D &pos1, const Vector4D &pos2, const double r) const
      {
        const double rngsq = r*r;
        const double dsq = (pos1-pos2).sqlen();
        //MB_DPRINTLN("isNear %.3f <=>%.3f", rngsq, dsq);
        //if (m_eps<rngsq-dsq)
        if (dsq<rngsq)
          return true;
        else
          return false;
      }

    void findBoxImpl(Node *pnode, const Vector4D &vfmin, const Vector4D &vfmax) const
    {
      int i;
      const Vector4D &vtgmin = pnode->vmin;
      const Vector4D &vtgmax = pnode->vmax;
      if (!intersect(vfmin, vfmax, vtgmin, vtgmax))
        return;

      //MB_DPRINTLN("Box %s--%s intsc", vtgmin.toString().c_str(), vtgmax.toString().c_str());

      // this pnode intersects with the probe box
      if (pnode->pc1==NULL /*&& pnode->pc2==NULL*/) {
        // this pnode is terminal node --> accumlate elements of pnode to rlist
        for (i=pnode->imin; i<pnode->imax; ++i) {
          m_ibuf[m_ibx] = i;
          ++m_ibx;
          //rlist.push_back(i);
        }
        return;
      }

      findBoxImpl(pnode->pc1, vfmin, vfmax);
      findBoxImpl(pnode->pc2, vfmin, vfmax);
    }

    static inline
      bool intersect(const Vector4D &vfmin, const Vector4D &vfmax,
                     const Vector4D &vmin, const Vector4D &vmax)
      {
        return overlap(vfmin.x(), vfmax.x(), vmin.x(), vmax.x()) &&
          overlap(vfmin.y(), vfmax.y(), vmin.y(), vmax.y()) &&
            overlap(vfmin.z(), vfmax.z(), vmin.z(), vmax.z());
      }

    static inline
      bool overlap(double min1, double max1, double min2, double max2)
      {
        if (max1<min2) return false;
        if (max2<min1) return false;
        return true;
      }

  };

} // namespace molstr

#endif // BSP_TREE_HPP_INCLUDED_

