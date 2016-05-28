// -*-Mode: C++;-*-
//
//  Color Lookup Table
//
//  $Id: ColorTable.cpp,v 1.6 2011/03/30 14:17:36 rishitani Exp $


#include <common.h>

#include "ColorTable.hpp"
#include "GradientColor.hpp"
#include "SolidColor.hpp"

using namespace gfx;

ColorTable::elem_t ColorTable::newColor(const ColorPtr &pCol, const LString &defmat, qlib::uid_t nSceneID)
{
  elem_t rval;

  qlib::LScrSp<GradientColor> pGradCol(pCol, qlib::no_throw_tag());

  if (!pGradCol.isnull()) {
    // generate gradient color
    const ColorPtr pc1 = pGradCol->getGradColor1();
    const ColorPtr pc2 = pGradCol->getGradColor2();
    const double rho = pGradCol->getGradParam();

    LString mat1 = pc1->getMaterial();
    if (mat1.isEmpty())
      mat1 = defmat;
    LString mat2 = pc2->getMaterial();
    if (mat2.isEmpty())
      mat2 = defmat;

    /*if (c1.isGradient() || c2.isGradient()) {
      // nested gradient
      LOG_DPRINTLN("LMesh> warning: nested gradient color may not be displayed correctly.");
    }*/

    // simple gradient
    // canonicalize: cid1<cid2
    rval.cid1 = clutNewColorImpl(pc1, mat1, nSceneID);
    rval.cid2 = clutNewColorImpl(pc2, mat2, nSceneID);
    if (rval.cid1>rval.cid2) {
      std::swap(rval.cid1, rval.cid2);
      rval.rho = convRho(rho, true);
    }
    else {
      rval.rho = convRho(rho, false);
    }

    // setup gradient registry
    appendGradient(rval);
  }
  else {
    // generate simple color
    // set simple color flag
    LString mat1 = pCol->getMaterial();
    if (mat1.isEmpty())
      mat1 = defmat;

    rval.cid2 = -1;
    rval.cid1 = clutNewColorImpl(pCol, mat1, nSceneID);
    rval.rho = 0;
  }
  return rval;
}

int ColorTable::clutNewColorImpl(const ColorPtr &pCol, const LString &mtr, qlib::uid_t nSceneID)
{
  int i;
  int nsize = m_clut.size();

  quint32 ccode;
  if (nSceneID==qlib::invalid_uid)
    ccode = pCol->getCode();
  else
    ccode= pCol->getDevCode(nSceneID);

  // LString mat = pCol->getMaterial();
  ClutElem ent(ccode, mtr);

  for (i=0; i<nsize; i++)
    if (m_clut[i].equals(ent))
      return i;

  m_clut.push_back(ent);
  return nsize;
}

int ColorTable::import(const ColorTable &src)
{
  int i;
  int rval = m_clut.size();
  int nsrcsize = src.size();
  for (i=0; i<nsrcsize; ++i) {
    //m_clut[rval+i] = src.m_clut[i];
    m_clut.push_back(src.m_clut[i]);
  }
  // m_nClutTop += src.m_nClutTop;
  return rval;
}

bool ColorTable::getColor(const elem_t & id, ColorPtr &rpc) const
{
  int nsize = m_clut.size();

  if (id.cid2<0) {
    if (id.cid1>=nsize)
      return false;
    // create solid color (with material)
    const unsigned int ccode = m_clut[ id.cid1 ].m_code;
    const LString &mat = m_clut[ id.cid1 ].m_mat;

    SolidColor *pc = new SolidColor(ccode);
    if (!mat.isEmpty())
      pc->setMaterial(mat);

    rpc = ColorPtr(pc);
  }
  else {
    if (id.cid1>=nsize || id.cid2>=nsize)
      return false;
    // create gradient color (with material)
    const int ccode1 = m_clut[ id.cid1 ].m_code;
    const int ccode2 = m_clut[ id.cid2 ].m_code;
    const int rho = id.rho;
    const LString &mat1 = m_clut[ id.cid1 ].m_mat;
    const LString &mat2 = m_clut[ id.cid2 ].m_mat;

    SolidColor *pgc1 = new SolidColor(ccode1);
    if (!mat1.isEmpty())
      pgc1->setMaterial(mat1);

    SolidColor *pgc2 = new SolidColor(ccode2);
    if (!mat2.isEmpty())
      pgc2->setMaterial(mat2);

    rpc = ColorPtr(new GradientColor(ColorPtr(pgc1), ColorPtr(pgc2), double(rho)/255.0));
  }
  return true;
}

bool ColorTable::getRGBAByteColor(const elem_t &id, unsigned char *pcols) const
{
  int nsize = m_clut.size();

  if (id.cid2<0) {
    if (id.cid1>=nsize)
      return false;

    //const unsigned int ccode = m_clut[ m_pCols[i].cid1 ];
    const unsigned int ccode = m_clut[ id.cid1 ].m_code;
    pcols[0] = (unsigned char)((ccode >> 16) & 0xFF);
    pcols[1] = (unsigned char)((ccode >> 8) & 0xFF);
    pcols[2] = (unsigned char)((ccode >> 0) & 0xFF);
    pcols[3] = (unsigned char)((ccode >> 24) & 0xFF);
  }
  else {
    if (id.cid1>=nsize || id.cid2>=nsize)
      return false;
    const int ccode1 = m_clut[ id.cid1 ].m_code;
    const int ccode2 = m_clut[ id.cid2 ].m_code;
    const int rho = id.rho;

    const int r1 = (ccode1 >> 16) & 0xFF;
    const int g1 = (ccode1 >>  8) & 0xFF;
    const int b1 = (ccode1 >>  0) & 0xFF;
    const int a1 = (ccode1 >> 24) & 0xFF;

    const int r2 = (ccode2 >> 16) & 0xFF;
    const int g2 = (ccode2 >>  8) & 0xFF;
    const int b2 = (ccode2 >>  0) & 0xFF;
    const int a2 = (ccode2 >> 24) & 0xFF;

    const int rb = ( r1*rho + r2*(255-rho) )/255;
    const int gb = ( g1*rho + g2*(255-rho) )/255;
    const int bb = ( b1*rho + b2*(255-rho) )/255;
    const int ab = ( a1*rho + a2*(255-rho) )/255;

    pcols[0] = (unsigned char)(rb & 0xFF);
    pcols[1] = (unsigned char)(gb & 0xFF);
    pcols[2] = (unsigned char)(bb & 0xFF);
    pcols[3] = (unsigned char)(ab & 0xFF);
  }
  return true;
}

bool ColorTable::getRGBAVecColor(const elem_t &id, Vector4D &vec) const
{
  unsigned char colary[4];
  bool res = getRGBAByteColor(id, colary);
  if (!res) return false;
  vec.x() = double(colary[0])/255.0;
  vec.y() = double(colary[1])/255.0;
  vec.z() = double(colary[2])/255.0;
  vec.w() = double(colary[3])/255.0;
  return true;
}

bool ColorTable::getMaterial(const elem_t & id, LString &rc) const
{
  int nsize = m_clut.size();

  if (id.cid1>=nsize)
    return false;

  rc = m_clut[ id.cid1 ].m_mat;
  return true;
}

