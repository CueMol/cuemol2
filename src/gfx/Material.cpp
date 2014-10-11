// -*-Mode: C++;-*-
//
// Material definition for StyleManager
//
// $Id: Material.cpp,v 1.1 2010/12/24 16:05:01 rishitani Exp $

#include <common.h>

#include "Material.hpp"

using namespace gfx;

Material::Material()
{
  m_sysmat[MAT_AMBIENT] = 0.2;
  m_sysmat[MAT_DIFFUSE] = 0.8;
  m_sysmat[MAT_SPECULAR] = 0.0;
  m_sysmat[MAT_SHININESS] = 0.0;
  m_sysmat[MAT_EMISSION] = 0.0;
}

void Material::setSysValue(int nID, double value)
{
  MB_ASSERT(MAT_AMBIENT<=nID && nID<=MAT_EMISSION);
  m_sysmat[nID] = value;
}

double Material::getSysValue(int nID) const
{
  return m_sysmat[nID];
}

void Material::setDepValue(const LString &type, const LString &value)
{
  m_depmat.forceSet(type, value);
}

LString Material::getDepValue(const LString &type) const
{
  return m_depmat.get(type);
}

