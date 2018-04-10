// -*-Mode: C++;-*-
//
// Density object class
//
// $Id: DensityMap.cpp,v 1.4 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>
#include "DensityMap.hpp"
#include "QdfDenMapWriter.hpp"

#include <qlib/Box3D.hpp>
#include <qsys/View.hpp>

using namespace xtal;
using symm::CrystalInfo;

// default constructor
DensityMap::DensityMap()
{
  m_nColInt = m_nRowInt = m_nSecInt = 0;
  m_nCols = m_nRows = m_nSecs = 0;
  m_nStartCol = m_nStartRow = m_nStartSec = 0;

  m_dMinMap = m_dMaxMap = m_dMeanMap = m_dRmsdMap = 0.0;
  m_pByteMap = NULL;
  // m_pRealMap = NULL;
  m_dLevelBase = m_dLevelStep = 0.0;

//  m_bUseMolBndry = false;
}

DensityMap::~DensityMap()
{
  if (m_pByteMap!=NULL)
    delete m_pByteMap;
  //if (m_pRealMap!=NULL)
  //delete m_pRealMap;
}

///////////////////////////////////////////////
// setup density map

// construct by float array
void DensityMap::setMapFloatArray(const float *array,
				  int ncol, int nrow, int nsect,
                                  int axcol, int axrow, int axsect)
{
  int ntotal = ncol*nrow*nsect;
  m_nCols = ncol;
  m_nRows = nrow;
  m_nSecs = nsect;

  // calculate a statistics of the map
  double
    rhomax=MAP_FLOAT_MIN, rhomin=MAP_FLOAT_MAX,
    rhomean=0.0, sqmean=0.0,
    rhodev=0.0;

  for (int i=0; i<ntotal; i++) {
    double rho = (double)array[i];
    rhomean += rho/float(ntotal);
    sqmean += rho*rho/float(ntotal);
    if (rho>rhomax)
      rhomax = rho;
    if (rho<rhomin)
      rhomin = rho;
  }

  rhodev = sqrt(sqmean-rhomean*rhomean);

  m_dMinMap = rhomin;
  m_dMaxMap = rhomax;
  m_dMeanMap = rhomean;
  m_dRmsdMap = rhodev;

  LOG_DPRINT("DensityMap.load> calculated stats:\n");
  LOG_DPRINT("  map minimum density  : %f\n", rhomin);
  LOG_DPRINT("  map maximum density  : %f\n", rhomax);
  LOG_DPRINT("  map mean density     : %f\n", rhomean);
  LOG_DPRINT("  map density r.m.s.d. : %f\n", rhodev);

  // map truncation
  m_dLevelStep = (double)(rhomax - rhomin)/256.0;
  m_dLevelBase = rhomin;

  MB_DPRINT("truncating to 8bit map base: %f, step: %f\n",
	    m_dLevelBase, m_dLevelStep);

  if (m_pByteMap!=NULL)
    delete [] m_pByteMap;

  //
  //

  rotate(m_nCols,m_nRows,m_nSecs,axcol,axrow,axsect);

  m_pByteMap = new qlib::ByteMap(m_nCols,m_nRows,m_nSecs);
  for (int k=0; k<nsect; k++)
    for (int j=0; j<nrow; j++)
      for (int i=0; i<ncol; i++) {
	double rho = (double)array[i + (j + k*nrow)*ncol];
	//rho = floor((rho-m_dLevelBase)/m_dLevelStep);
	rho = (rho-m_dLevelBase)/m_dLevelStep;
	if (rho<0) rho = 0.0;
	if (rho>255) rho = 255.0;
	int ii=i,jj=j,kk=k;
	rotate(ii,jj,kk,axcol,axrow,axsect);
        m_pByteMap->at(ii,jj,kk) = (unsigned char)rho;
        // (*m_pByteMap)[ii][jj][kk] = (unsigned char)rho;
      }


  MB_DPRINTLN("OK.");
}

/** construct by uchar array
    array must be sorted by the Fast-Medium-Slow order
 */
void DensityMap::setMapByteArray(const unsigned char*array,
                                 int ncol, int nrow, int nsect,
                                 double rhomin, double rhomax, double mean, double sigma)
{
  int ntotal = ncol*nrow*nsect;
  m_nCols = ncol;
  m_nRows = nrow;
  m_nSecs = nsect;

  m_dMinMap = rhomin;
  m_dMaxMap = rhomax;
  m_dMeanMap = mean;
  m_dRmsdMap = sigma;

  MB_DPRINTLN("load density map ...");
  MB_DPRINTLN("   minimum: %f", rhomin);
  MB_DPRINTLN("   maximum: %f", rhomax);
  MB_DPRINTLN("   mean   : %f", mean);
  MB_DPRINTLN("   r.m.s.d: %f", sigma);

  // calc map trunc params
  m_dLevelStep = (double)(rhomax - rhomin)/256.0;
  m_dLevelBase = rhomin;

  if (m_pByteMap!=NULL)
    delete [] m_pByteMap;

  m_pByteMap = new qlib::ByteMap(m_nCols,m_nRows,m_nSecs, array);

  //typedef boost::const_multi_array_ref<QUE_BYTE, 3> ConstArrayRef;
  //ConstArrayRef source(array, boost::extents[m_nCols][m_nRows][m_nSecs]);
  //m_pByteMap = new ByteMap(boost::extents[m_nCols][m_nRows][m_nSecs]);
  //(*m_pByteMap) = source;

  MB_DPRINTLN("OK.");
}

// setup column, row, section params
void DensityMap::setMapParams(int stacol, int starow, int stasect,
			      int intcol, int introw, int intsect)
{
  m_nStartCol = stacol;
  m_nStartRow = starow;
  m_nStartSec = stasect;

  m_nColInt = intcol;
  m_nRowInt = introw;
  m_nSecInt = intsect;
}

// setup crystal system's parameters
void DensityMap::setXtalParams(double a, double b, double c,
                               double alpha, double beta, double gamma, int nsg /* = 1 (P1) */)
{
  m_xtalInfo.setCellDimension(a,b,c,alpha,beta,gamma);
  m_xtalInfo.setSG(nsg);

  CrystalInfo *pci = new CrystalInfo(a,b,c,alpha,beta,gamma,nsg);
  this->setExtData(qsys::ObjExtDataPtr(pci));
}

Vector4D DensityMap::getCenter() const
{
/*
  Vector4D fcen;
  fcen.x() = (double(m_nStartCol)+double(m_nCols)/2.0)/double(m_nColInt);
  fcen.y() = (double(m_nStartRow)+double(m_nRows)/2.0)/double(m_nRowInt);
  fcen.z() = (double(m_nStartSec)+double(m_nSecs)/2.0)/double(m_nSecInt);
  
  m_xtalInfo.fracToOrth(fcen);
  return fcen;
*/
  Vector4D tv(double(m_nStartCol+m_nCols)/2.0,
              double(m_nStartRow+m_nRows)/2.0,
              double(m_nStartSec+m_nSecs)/2.0);
  tv = convToOrth(tv);
  return tv;
}

/*
void DensityMap::dump()
{
  LOG_DPRINT("DensityMap dump...\n");
  LOG_DPRINT("  map size  : (%d,%d,%d)\n", 
             m_pByteMap->shape()[0],
             m_pByteMap->shape()[1],
             m_pByteMap->shape()[2]);
             //m_pByteMap->getColumns(),
             //m_pByteMap->getRows(),
             //m_pByteMap->getSections());
  LOG_DPRINT("  map start : (%d,%d,%d)\n",
            m_nStartCol, m_nStartRow, m_nStartSec);
  LOG_DPRINT("  map intrv : (%d,%d,%d)\n",
             m_nColInt, m_nRowInt, m_nSecInt);
  LOG_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n",
             m_xtalInfo.a(), m_xtalInfo.b(), m_xtalInfo.c());
  LOG_DPRINT("    alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n",
             m_xtalInfo.alpha(), m_xtalInfo.beta(), m_xtalInfo.gamma());
  LOG_DPRINT("  map minimum density  : %f\n", m_dMinMap);
  LOG_DPRINT("  map maximum density  : %f\n", m_dMaxMap);
  LOG_DPRINT("  map mean density     : %f\n", m_dMeanMap);
  LOG_DPRINT("  map density r.m.s.d. : %f\n", m_dRmsdMap);
}
*/

double DensityMap::getValueAt(const Vector4D &pos) const
{
  Vector4D tv(pos);

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // apply inv of xformMat
    qlib::Matrix3D rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    Vector4D tr = xfm.getTransPart();
    tv -= tr;
    tv = rmat.mulvec(tv);
  }

  m_xtalInfo.orthToFrac(tv);
  
  tv.x() *= double(getColInterval());
  tv.y() *= double(getRowInterval());
  tv.z() *= double(getSecInterval());

  tv.x() -= double(m_nStartCol);
  tv.y() -= double(m_nStartRow);
  tv.z() -= double(m_nStartSec);

  //if (tv.x()<0.0 || tv.x()>m_pByteMap->getColumns() ||
  //tv.y()<0.0 || tv.y()>m_pByteMap->getRows() ||
  //tv.z()<0.0 || tv.z()>m_pByteMap->getSections())

  const int i = int(tv.x());
  const int j = int(tv.y());
  const int k = int(tv.z());

  if (!isInBoundary(i,j,k)) return 0.0;
  return atFloat( i,j,k );
}

bool DensityMap::isInRange(const Vector4D &pos) const
{
  Vector4D tv(pos);

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // apply inv of xformMat
    qlib::Matrix3D rmat = xfm.getMatrix3D();
    rmat = rmat.invert();
    Vector4D tr = xfm.getTransPart();
    tv -= tr;
    tv = rmat.mulvec(tv);
  }

  m_xtalInfo.orthToFrac(tv);
  
  tv.x() *= double(getColInterval());
  tv.y() *= double(getRowInterval());
  tv.z() *= double(getSecInterval());

  tv.x() -= double(m_nStartCol);
  tv.y() -= double(m_nStartRow);
  tv.z() -= double(m_nStartSec);

  //if (tv.x()<0.0 || tv.x()>m_pByteMap->getColumns() ||
  //tv.y()<0.0 || tv.y()>m_pByteMap->getRows() ||
  //tv.z()<0.0 || tv.z()>m_pByteMap->getSections())

  const int i = int(tv.x());
  const int j = int(tv.y());
  const int k = int(tv.z());
  
  return isInBoundary(i,j,k);
}

Vector4D DensityMap::convToOrth(const Vector4D &index) const
{
  Vector4D tv = index;

  tv.x() += double(m_nStartCol);
  tv.y() += double(m_nStartRow);
  tv.z() += double(m_nStartSec);

  // interval == 1/(grid spacing)
  tv.x() /= double(getColInterval());
  tv.y() /= double(getRowInterval());
  tv.z() /= double(getSecInterval());

  // tv is now fractional coord.
  // conv frac-->orth
  m_xtalInfo.fracToOrth(tv);

  // tv is now in orthogonal coord.

  const Matrix4D &xfm = getXformMatrix();
  if (!xfm.isIdent()) {
    // Apply xformMat
    tv.w() = 1.0;
    tv = xfm.mulvec(tv);
  }

  return tv;
}

//////////////////////////////////////////////////////////

double DensityMap::getRmsdDensity() const
{
  return m_dRmsdMap;
}

double DensityMap::getLevelBase() const
{
  return m_dLevelBase;
}

double DensityMap::getLevelStep() const
{
  return m_dLevelStep;
}

bool DensityMap::isInBoundary(int i, int j, int k) const
{
  /*
  if (i<0 || m_pByteMap->shape()[0]<=i)
    return false;
  if (j<0 || m_pByteMap->shape()[1]<=j)
    return false;
  if (k<0 || m_pByteMap->shape()[2]<=k)
    return false;
*/

  if (i<0 || m_pByteMap->getColumns()<=i)
    return false;
  if (j<0.0 || m_pByteMap->getRows()<=j)
    return false;
  if (k<0.0 || m_pByteMap->getSections()<=k)
    return false;

  return true;
}

unsigned char DensityMap::atByte(int i, int j, int k) const
{
//  if (m_bUseBndry)
//    return getAtWithBndry(i, j, k);
//  else 
//    return (*m_pByteMap)[i][j][k];
  //return (*m_pByteMap)[i][j][k];
  return m_pByteMap->at(i,j,k);
}

double DensityMap::atFloat(int i, int j, int k) const
{
  unsigned char b = atByte(i,j,k);
  return double(b)*m_dLevelStep + m_dLevelBase;
}

/*
unsigned char DensityMap::getAtWithBndry(int nx, int ny, int nz) const
{
  Vector4D tv(nx, ny, nz);

  tv.x() += double(m_nStartCol);
  tv.y() += double(m_nStartRow);
  tv.z() += double(m_nStartSec);

  // interval == 1/(grid spacing)
  tv.x() /= double(getColInterval());
  tv.y() /= double(getRowInterval());
  tv.z() /= double(getSecInterval());

  // tv is now fractional coord.
  // conv frac-->orth
  m_xtalInfo.fracToOrth(tv);

  // tv is now in orthogonal coord.

  //if (!m_boundary.collChk(tv, m_dBndryRng)) {
  //return 0;
  //}

  //return (*m_pByteMap)[nx][ny][nz];
  return m_pByteMap->at(nx,ny,nz);
}
*/

Vector4D DensityMap::getOrigin() const
{
  return Vector4D(0,0,0);
}

double DensityMap::getColGridSize() const
{
  return (getXtalInfo().a()) / double(m_nColInt);
}

double DensityMap::getRowGridSize() const
{
  return (getXtalInfo().b()) / double(m_nRowInt);
}

double DensityMap::getSecGridSize() const
{
  return (getXtalInfo().c()) / double(m_nSecInt);
}

//////////

LString DensityMap::getDataChunkReaderName(int nQdfVer) const
{
  return LString("qdfmap");
}

void DensityMap::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
  QdfDenMapWriter writer;
  writer.setVersion(oos.getQdfVer());
  writer.setEncType(oos.getQdfEncType());

  DensityMap *pthis = const_cast<DensityMap *>(this);
  writer.attach(qsys::ObjectPtr(pthis));
  writer.write(oos);
  writer.detach();
}


#if 0
LString DensityMap::getHistogramJSON(double min, double max, int nbins)
{
  double dbinw = (max-min)/double(nbins);
  //int nbins = int( (m_dMaxMap-m_dMinMap)/dbinw );
  MB_DPRINTLN("DenMap.hist> nbins=%d", nbins);

  int ni = m_pByteMap->getColumns();
  int nj = m_pByteMap->getRows();
  int nk = m_pByteMap->getSections();

  std::vector<int> histo(nbins);
  for (int i=0; i<nbins; ++i)
    histo[i] = 0;
  
  for (int i=0; i<ni; ++i)
    for (int j=0; j<nj; ++j)
      for (int k=0; k<nk; ++k) {
        double rho = atFloat(i,j,k);
        int ind = (int) ::floor( (rho-min)/dbinw );
        if (ind<0 || ind>=nbins) {
          //MB_DPRINTLN("ERROR!! invalid density value at (%d,%d,%d)=%f", i,j,k,rho);
        }
        else {
          histo[ind]++;
        }
      }
        
  int nmax = 0;
  for (int i=0; i<nbins; ++i)
    nmax = qlib::max(histo[i], nmax);

  LString rval = "{";
  rval += LString::format("\"min\":%f,\n", m_dMinMap/m_dRmsdMap);
  rval += LString::format("\"max\":%f,\n", m_dMaxMap/m_dRmsdMap);
  rval += LString::format("\"nbin\":%d,\n", nbins);
  rval += LString::format("\"nmax\":%d,\n", nmax);
  rval += LString::format("\"sig\":%f,\n", m_dRmsdMap);
  rval += "\"histo\":[";
  for (int i=0; i<nbins; ++i) {
    MB_DPRINTLN("%d %d", i, histo[i]);
    if (i>0)
      rval += ",";
    rval += LString::format("%d", histo[i]);
  }
  rval += "]}\n";
  
  return rval;
}
#endif

using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::Box3D;

void DensityMap::fitView(const qsys::ViewPtr &pView, bool dummy) const
{
  qlib::LQuat rotq = pView->getRotQuat();
  Matrix4D ecmat = Matrix4D::makeRotMat(rotq);

  Box3D bbox, ecbbox;

  {
    Vector4D vpos;

    // get object xform
    Matrix4D xform = getXformMatrix();

    // get frac-->orth matrix
    Matrix3D orthmat = getXtalInfo().getOrthMat();
    xform.matprod( Matrix4D(orthmat) );

    bbox.merge( xform.mulvec(Vector4D(0,0,0,1)) );
    bbox.merge( xform.mulvec(Vector4D(1,0,0,1)) );
    bbox.merge( xform.mulvec(Vector4D(0,1,0,1)) );
    bbox.merge( xform.mulvec(Vector4D(0,0,1,1)) );
    bbox.merge( xform.mulvec(Vector4D(1,1,0,1)) );
    bbox.merge( xform.mulvec(Vector4D(0,1,1,1)) );
    bbox.merge( xform.mulvec(Vector4D(1,0,1,1)) );
    bbox.merge( xform.mulvec(Vector4D(1,1,1,1)) );

    // xform = xform * ecmat
    xform.matprod( ecmat );

    ecbbox.merge( xform.mulvec(Vector4D(0,0,0,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(1,0,0,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(0,1,0,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(0,0,1,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(1,1,0,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(0,1,1,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(1,0,1,1)) );
    ecbbox.merge( xform.mulvec(Vector4D(1,1,1,1)) );
  }
  
  MB_DPRINTLN("map bbox start: (%f,%f,%f)", bbox.vstart.x(), bbox.vstart.y(), bbox.vstart.z());
  MB_DPRINTLN("map bbox   end: (%f,%f,%f)", bbox.vend.x(), bbox.vend.y(), bbox.vend.z());

  MB_DPRINTLN("map ec bbox start: (%f,%f,%f)", ecbbox.vstart.x(), ecbbox.vstart.y(), ecbbox.vstart.z());
  MB_DPRINTLN("map ec bbox   end: (%f,%f,%f)", ecbbox.vend.x(), ecbbox.vend.y(), ecbbox.vend.z());

  /*{
    // inflate box by 20%
    Vector4D dv = (bbox.vend - bbox.vstart).scale(0.2);
    bbox.vend += dv;
    bbox.vstart -= dv;
  }*/

  pView->setViewCenter( bbox.center() );

  Vector4D ecboxst = ecbbox.vstart - ecbbox.center();
  Vector4D ecboxen = ecbbox.vend - ecbbox.center();
  
  int cx = pView->getWidth();
  int cy = pView->getHeight();
  double fasp = double(cx)/double(cy);

  double mx = qlib::abs(ecboxen.x()-ecboxst.x());
  double my = qlib::abs(ecboxen.y()-ecboxst.y());
  double masp = mx / my;

  MB_DPRINTLN("mx: %f", mx);
  MB_DPRINTLN("my: %f", my);
  MB_DPRINTLN("fasp: %f", fasp);
  MB_DPRINTLN("masp: %f", masp);

  double zoom;
  if (fasp>1.0) {
    if (masp>fasp) {
      zoom = mx/fasp;
    }
    else {
      zoom = my;
    }
  }
  else {
    if (masp>fasp) {
      zoom = mx/fasp;
    }
    else {
      zoom = my;
    }
  }

  // MB_DPRINTLN("Zoom: %f", zoom);
  pView->setZoom(zoom);

  double sd = qlib::abs(ecboxen.z()-ecboxst.z());
  if (pView->getSlabDepth()>sd)
    return;
  
  if (pView->getViewDist()*2>sd)
    pView->setSlabDepth(sd);
  else {
    // slab depth is wider than the view distance
    // --> have to change the view distance to enough accomodate the slab depth
    pView->setViewDist(sd/2);
    pView->setSlabDepth(sd);
  }

}

