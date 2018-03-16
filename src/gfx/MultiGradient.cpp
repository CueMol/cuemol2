// -*-Mode: C++;-*-
//
//  Multi-color gradient class
//

#include <common.h>

#include "MultiGradient.hpp"
#include "SolidColor.hpp"
#include "GradientColor.hpp"
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/LDOM2Tree.hpp>

using namespace gfx;

MC_CLONEABLE_IMPL(gfx::MultiGradient);

MultiGradient::MultiGradient()
{
}

MultiGradient::~MultiGradient()
{
}

/// get color
ColorPtr MultiGradient::getColor(double rho) const
{
  if (m_data.empty())
    return SolidColor::createRGB(0.0, 0.0, 0.0, 1.0);

  data_t::const_iterator iter = m_data.begin();

  if (m_data.size()==1)
    return iter->pColor;

  // check lower bound
  if (iter->value>rho) {
    return iter->pColor;
  }
  
  // check higher bound
  data_t::const_iterator eiter = m_data.end();
  data_t::const_iterator iter2 = eiter;
  --iter2;
  if (iter2->value<=rho) {
    return iter2->pColor;
  }

  // check middle points (iter, iter2)
  for (; iter!=eiter; ++iter) {
    iter2 = iter;
    iter2++;

    double v1 = iter->value;
    double v2 = iter2->value;
    if (v1<=rho && rho<v2) {
      double rho2 = (rho-v1)/(v2-v1);
      return ColorPtr(new GradientColor(iter->pColor, iter2->pColor, rho2)); 
    }
  }

  // should not be reached here!!
  MB_ASSERT(false);
  LOG_DPRINTLN("ERROR!!");
  return gfx::SolidColor::createRGB(0.0, 0.0, 0.0, 1.0);
}

MultiGradient::data_t::const_iterator MultiGradient::getIterAt(int ind) const
{
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();

  if (ind>=m_data.size())
    return eiter;

  int i=ind;
  while ( i>0 && iter!=eiter) {
    --i;
    ++iter;    
  }

  return iter;
}

MultiGradient::data_t::iterator MultiGradient::getIterAt(int ind)
{
  data_t::iterator iter = m_data.begin();
  data_t::iterator eiter = m_data.end();

  if (ind>=m_data.size())
    return eiter;

  int i=ind;
  while ( i>0 && iter!=eiter) {
    --i;
    ++iter;    
  }

  return iter;
}

double MultiGradient::getValueAt(int ind) const
{
  data_t::const_iterator iter = getIterAt(ind);

  if (iter==m_data.end()) {
    MB_THROW(qlib::RuntimeException, "error");
  }

  return iter->value;
}

ColorPtr MultiGradient::getColorAt(int ind) const
{
  data_t::const_iterator iter = getIterAt(ind);

  if (iter==m_data.end()) {
    MB_THROW(qlib::RuntimeException, "error");
  }

  return iter->pColor;
}

bool MultiGradient::removeAt(int ind)
{
  data_t::iterator iter = getIterAt(ind);

  if (iter==m_data.end())
    return false;

  m_data.erase(iter);
  return true;
}

void MultiGradient::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  BOOST_FOREACH(const Node &pt, m_data) {
    qlib::LDom2Node *pChNode = pNode->appendChild("gradnode");
    // always in child element
    pChNode->setAttrFlag(false);

    {
      // write num (value) of tuple (maybe stored as attribute)
      LString val = LString::format("%f", pt.value);
      pChNode->appendStrAttr("par", val);
    }
    {
      // write color of tuple (maybe stored as attribute)
      qlib::LDom2Node *pColNode = pChNode->appendChild("col");
      pColNode->setupByObject(pt.pColor.get());
    }

  }
}

void MultiGradient::readFrom2(qlib::LDom2Node *pNode)
{
  // read properties
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();

    if (!tag.equals("gradnode")) {
      continue;
    }

    if (pChNode->findChild("par")==NULL) {
      LOG_DPRINTLN("MultiGradient.readFrom> no value attr in gradnode tag!!");
      continue;
    }

    LString valstr = pChNode->getStrAttr("par");
    double val;
    if (!valstr.toDouble(&val)) {
      LOG_DPRINTLN("MultiGradient.readFrom> invalid value attr in gradnode tag!!");
      continue;
    }

    qlib::LDom2Node *pColNode = pChNode->findChild("col");
    if (pColNode==NULL) {
      LOG_DPRINTLN("MultiGradient.readFrom> no color valule in gradnode tag!!");
      continue;
    }
    ColorPtr pCol(gfx::AbstractColor::fromNode(pColNode));

    insert(val, pCol);
  }

}

//static
MultiGradientPtr MultiGradient::createDefaultS()
{
  MultiGradientPtr pRes(MB_NEW MultiGradient());
  pRes->insert(0.0, SolidColor::createRGB(1.0, 1.0, 1.0, 1.0));
  return pRes;
}

