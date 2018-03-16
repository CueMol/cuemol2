// -*-Mode: C++;-*-
//
//  Multi-color gradient
//

#ifndef GFX_MULTI_GRADIENT_HPP_INCLUDE_
#define GFX_MULTI_GRADIENT_HPP_INCLUDE_

#include "gfx.hpp"
#include "AbstractColor.hpp"

using qlib::LString;

namespace qlib {
  class Vector4D;
}

namespace gfx {

  ///
  //   Multi-color gradient class
  //
  class GFX_API MultiGradient : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:

    typedef qlib::LSimpleCopyScrObject super_t;

    struct Node
    {
      double value;
      ColorPtr pColor;
      Node(double aval, ColorPtr acol) : value(aval), pColor(acol) {}
    };

    struct NodeComp
    {
      bool operator() (const Node &n1, const Node &n2) const
      {
        return n1.value<n2.value;
      }
    };

    typedef std::set<Node, NodeComp> data_t;

    data_t m_data;

    data_t::const_iterator getIterAt(int ind) const;
    data_t::iterator getIterAt(int ind);

  public:
    MultiGradient();
    // MultiGradient(const MultiGradient &r);

    virtual ~MultiGradient();

    /// clear all gradient nodes
    void clear() { m_data.clear(); }

    /// append a new node
    /// @return returns index of the inserted node. returns -1 if the same value alreadly presents.
    int insert(double value, const ColorPtr &color)
    {
      std::pair<data_t::iterator, bool> res = m_data.insert(Node(value, color));
      if (!res.second)
        return -1;
      int nres = 0;
      data_t::iterator iter = m_data.begin();
      for (; iter!=m_data.end(); ++iter, ++nres) {
        if (iter==res.first)
          break;
      }
      return nres;
    }

    /// get color
    ColorPtr getColor(double rho) const;

    /// get node count
    int getSize() const { return m_data.size(); }

    ColorPtr getColorAt(int ind) const;
    double getValueAt(int ind) const;

    bool removeAt(int ind);
    bool changeAt(int ind, double value, const ColorPtr &color)
    {
      if (!removeAt(ind))
        return false;
      insert(value, color);
      return true;
    }


    //////////////////////////////////////////////////////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    // utility method for creating default value
    static MultiGradientPtr createDefaultS();
  };

}

#endif

