// -*-Mode: C++;-*-
//
// Material definition for StyleManager
//
// $Id: Material.cpp,v 1.1 2010/12/24 16:05:01 rishitani Exp $

#include <common.h>

#include "Material.hpp"
#include <qlib/LDOM2Tree.hpp>

using namespace gfx;

#define MAT_AMBIENT_DEFAULT 0.2
#define MAT_DIFFUSE_DEFAULT 0.8
#define MAT_SPECULAR_DEFAULT 0.0
#define MAT_SHININESS_DEFAULT 0.0
#define MAT_EMISSION_DEFAULT 0.0

Material::Material()
{
  m_sysmat[MAT_AMBIENT] = MAT_AMBIENT_DEFAULT;
  m_sysmat[MAT_DIFFUSE] = MAT_DIFFUSE_DEFAULT;
  m_sysmat[MAT_SPECULAR] = MAT_SPECULAR_DEFAULT;
  m_sysmat[MAT_SHININESS] = MAT_SHININESS_DEFAULT;
  m_sysmat[MAT_EMISSION] = MAT_EMISSION_DEFAULT;

  m_bHasSysVal = false;
  m_bHasDepVal = false;
}

void Material::setSysValue(int nID, double value)
{
  MB_ASSERT(MAT_AMBIENT<=nID && nID<=MAT_EMISSION);
  m_sysmat[nID] = value;
  m_bHasSysVal = true;
}

double Material::getSysValue(int nID) const
{
  return m_sysmat[nID];
}

bool Material::hasSysValue(int nID) const
{
  return m_bHasSysVal;
}

void Material::setDepValue(const LString &type, const LString &value)
{
  m_depmat.forceSet(type, value);
  m_bHasDepVal = true;
}

LString Material::getDepValue(const LString &type) const
{
  return m_depmat.get(type);
}

bool Material::hasDepValue(const LString &type) const
{
  if (m_depmat.containsKey(type))
    return true;
  else
    return false;
}

void Material::writeTo(qlib::LDom2Node *pNode) const
{
  if (m_bHasSysVal) {
    
    qlib::LDom2Node *pCNode = pNode->appendChild();
    pCNode->setTagName("def");

    if (!qlib::isNear4(m_sysmat[MAT_AMBIENT], MAT_AMBIENT_DEFAULT)) {
      pCNode->setStrAttr("ambient", LString::fromReal(m_sysmat[MAT_AMBIENT]));
    }
    if (!qlib::isNear4(m_sysmat[MAT_DIFFUSE], MAT_DIFFUSE_DEFAULT)) {
      pCNode->setStrAttr("diffuse", LString::fromReal(m_sysmat[MAT_DIFFUSE]));
    }
    if (!qlib::isNear4(m_sysmat[MAT_SPECULAR], MAT_SPECULAR_DEFAULT)) {
      pCNode->setStrAttr("specular", LString::fromReal(m_sysmat[MAT_SPECULAR]));
    }
    // TO DO: impl
  }

  if (m_bHasDepVal) {
    qlib::MapTable<LString>::const_iterator iter = m_depmat.begin();
    qlib::MapTable<LString>::const_iterator eiter = m_depmat.end();
    for (;iter!=eiter; ++iter) {
      const LString &key = iter->first;
      const LString &val = iter->second;
      
      qlib::LDom2Node *pCNode = pNode->appendChild();
      pCNode->setTagName("def");
      pCNode->appendStrAttr("type", key);
      pCNode->setContents(val);
    }
  }
}

