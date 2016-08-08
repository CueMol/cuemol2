// -*-Mode: C++;-*-
//
//  Draw element
//

#include <common.h>

#include "DrawElem.hpp"
#include "PixelBuffer.hpp"

using namespace gfx;

AbstDrawElem::AbstDrawElem()
     : m_nSize(0), m_pVBORep(NULL), m_pIndVBO(NULL), m_nDrawMode(DRAW_POINTS), m_bUpdate(false)
{
}

AbstDrawElem::~AbstDrawElem()
{
  if (m_pVBORep!=NULL)
    delete m_pVBORep;
  if (m_pIndVBO!=NULL)
    delete m_pIndVBO;
}

void AbstDrawElem::invalidateCache() const
{
  if (m_pVBORep!=NULL)
    delete m_pVBORep;
  m_pVBORep = NULL;

  if (m_pIndVBO!=NULL)
    delete m_pIndVBO;
  m_pIndVBO = NULL;
}

//////////

DrawElem::DrawElem()
  : super_t(),
    m_fLineWidth(1.0f),
    m_nDefColor(0xFFFFFFFF) // default color: white
{
}

DrawElem::~DrawElem()
{
}

void DrawElem::setDefColor(const ColorPtr &col)
{
  m_nDefColor = col->getCode();
}

bool DrawElem::normal(int ind, const Vector4D &v)
{
  return false;
}

bool DrawElem::color(int ind, quint32 c)
{
  return false;
}

//////////////////////////

DrawElemVC::DrawElemVC() : super_t(), m_pData(NULL)
{
}

DrawElemVC::~DrawElemVC()
{
  if (m_pData!=NULL)
    delete [] m_pData;
}

void DrawElemVC::alloc(int nsize)
{
  if (m_pData!=NULL)
    delete [] m_pData;
  m_pData = new Elem[nsize];
  setSize(nsize);
}

bool DrawElemVC::vertex(int ind, const Vector4D &v)
{
  if (ind<0 || getSize()<=ind) return false;

  m_pData[ind].x = qfloat32(v.x());
  m_pData[ind].y = qfloat32(v.y());
  m_pData[ind].z = qfloat32(v.z());
  return true;
}

bool DrawElemVC::getVertex(int ind, Vector4D &v) const
{
  if (ind<0 || getSize()<=ind) return false;

  v.x() = m_pData[ind].x;
  v.y() = m_pData[ind].y;
  v.z() = m_pData[ind].z;
  return true;
}

bool DrawElemVC::color(int ind, quint32 c)
{
  if (ind<0 || getSize()<=ind) return false;

  m_pData[ind].r = gfx::getRCode(c);
  m_pData[ind].g = gfx::getGCode(c);
  m_pData[ind].b = gfx::getBCode(c);
  m_pData[ind].a = gfx::getACode(c);
  return true;
}

//////////////////////////

DrawElemV::DrawElemV() : super_t(), m_pData(NULL)
{
}

DrawElemV::~DrawElemV()
{
  if (m_pData!=NULL)
    delete [] m_pData;
}

void DrawElemV::alloc(int nsize)
{
  if (m_pData!=NULL)
    delete [] m_pData;
  m_pData = new Elem[nsize];
  setSize(nsize);
}

bool DrawElemV::vertex(int ind, const Vector4D &v)
{
  if (ind<0 || getSize()<=ind) return false;

  m_pData[ind].x = qfloat32(v.x());
  m_pData[ind].y = qfloat32(v.y());
  m_pData[ind].z = qfloat32(v.z());
  return true;
}

bool DrawElemV::getVertex(int ind, Vector4D &v) const
{
  if (ind<0 || getSize()<=ind) return false;

  v.x() = m_pData[ind].x;
  v.y() = m_pData[ind].y;
  v.z() = m_pData[ind].z;
  return true;
}

//////////////////////////

DrawElemVNC::DrawElemVNC() : super_t(), m_pData(NULL)
{
}

DrawElemVNC::~DrawElemVNC()
{
  if (m_pData!=NULL)
    delete [] m_pData;
}

void DrawElemVNC::alloc(int nsize)
{
  if (m_pData!=NULL)
    delete [] m_pData;
  m_pData = new Elem[nsize];
  setSize(nsize);
}

bool DrawElemVNC::vertex(int ind, const Vector4D &v)
{
  if (ind<0 || getSize()<=ind) return false;

  m_pData[ind].x = qfloat32(v.x());
  m_pData[ind].y = qfloat32(v.y());
  m_pData[ind].z = qfloat32(v.z());
  return true;
}

bool DrawElemVNC::getVertex(int ind, Vector4D &v) const
{
  if (ind<0 || getSize()<=ind) return false;

  v.x() = m_pData[ind].x;
  v.y() = m_pData[ind].y;
  v.z() = m_pData[ind].z;
  return true;
}

bool DrawElemVNC::color(int ind, quint32 c)
{
  if (ind<0 || getSize()<=ind) return false;
  // MB_DPRINTLN("color %d %X", ind, c);
  m_pData[ind].r = gfx::getRCode(c);
  m_pData[ind].g = gfx::getGCode(c);
  m_pData[ind].b = gfx::getBCode(c);
  m_pData[ind].a = gfx::getACode(c);
  return true;
}

bool DrawElemVNC::normal(int ind, const Vector4D &v)
{
  if (ind<0 || getSize()<=ind) return false;

  m_pData[ind].nx = qfloat32(v.x());
  m_pData[ind].ny = qfloat32(v.y());
  m_pData[ind].nz = qfloat32(v.z());
  return true;
}

////////////

DrawElemVNCI::DrawElemVNCI()
     : super_t(), m_pIndData(NULL)
{
}

DrawElemVNCI::~DrawElemVNCI()
{
  if (m_pIndData!=NULL)
    delete [] m_pIndData;
  
}

void DrawElemVNCI::allocIndex(int ninds)
{
  MB_ASSERT(m_pIndData==NULL);

  m_nIndSize = ninds;
  m_pIndData = new index_t[ninds];
}

////////////

DrawElemVNCI32::DrawElemVNCI32()
     : super_t(), m_pIndData(NULL)
{
}

DrawElemVNCI32::~DrawElemVNCI32()
{
  if (m_pIndData!=NULL)
    delete [] m_pIndData;
}

void DrawElemVNCI32::allocIndex(int ninds)
{
  MB_ASSERT(m_pIndData==NULL);

  m_nIndSize = ninds;
  m_pIndData = new index_t[ninds];
}

////////////

DrawElemPix::DrawElemPix()
     : super_t(), m_pPixBuf(NULL)
{
}

DrawElemPix::~DrawElemPix()
{
  if (m_pPixBuf!=NULL)
    delete m_pPixBuf;
}

int DrawElemPix::getType() const { return VA_PIXEL; }

/// implemented but should not be used
void DrawElemPix::alloc(int nsize)
{
}

bool DrawElemPix::vertex(int ind, const Vector4D &v)
{
  return false;
}

void DrawElemPix::setup(const PixelBuffer &pxdata, const Vector4D &pos, quint32 color)
{
  m_pos = pos;
  m_color = color;
  m_pPixBuf = MB_NEW gfx::PixelBuffer(pxdata);
}

