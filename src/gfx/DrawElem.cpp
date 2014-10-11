// -*-Mode: C++;-*-
//
//  Draw element
//

#include <common.h>

#include "DrawElem.hpp"
#include "PixelBuffer.hpp"

using namespace gfx;

DrawElem::DrawElem()
  : m_nSize(0), m_nDrawMode(DRAW_POINTS),
    m_fLineWidth(1.0f),
    m_nDefColor(0xFFFFFFFF), // default color: white
    m_pVBORep(NULL)
{
}

DrawElem::~DrawElem()
{
  if (m_pVBORep!=NULL)
    delete m_pVBORep;
}

void DrawElem::startPoints(int nsize)
{
  m_nDrawMode = DRAW_POINTS;
  alloc(nsize);
}

void DrawElem::startLines(int nsize)
{
  m_nDrawMode = DRAW_LINES;
  alloc(nsize);
}

void DrawElem::startTriangles(int nsize)
{
  m_nDrawMode = DRAW_TRIANGLES;
  alloc(nsize);
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

void DrawElem::invalidateCache() const
{
  if (m_pVBORep!=NULL)
    delete m_pVBORep;
  m_pVBORep = NULL;
}

//////////////////////////

DrawElemVC::DrawElemVC() : m_pData(NULL)
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

DrawElemV::DrawElemV() : m_pData(NULL)
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

//////////////////////////

DrawElemVNC::DrawElemVNC() : m_pData(NULL)
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
     : m_pIndData(NULL), m_pIndVBO(NULL)
{
}

DrawElemVNCI::~DrawElemVNCI()
{
  if (m_pIndData!=NULL)
    delete [] m_pIndData;
  
  if (m_pIndVBO!=NULL)
    delete m_pIndVBO;
}

void DrawElemVNCI::allocIndex(int ninds)
{
  MB_ASSERT(m_pIndData==NULL);
  MB_ASSERT(m_pIndVBO==NULL);

  m_nIndSize = ninds;
  m_pIndData = new index_t[ninds];
}

void DrawElemVNCI::invalidateCache() const
{
  super_t::invalidateCache();
  
  if (m_pIndVBO!=NULL)
    delete m_pIndVBO;
  m_pIndVBO = NULL;
}

////////////

DrawElemPix::DrawElemPix()
     : m_pPixBuf(NULL)
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

