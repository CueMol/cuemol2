// -*-Mode: C++;-*-
//
// Density object class
//
// $Id: DensityMap.cpp,v 1.4 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>
#include "DensityMap.hpp"
#include "QdfDenMapWriter.hpp"

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

  MB_DPRINT("load density map ...\n");
  MB_DPRINT("   minimum: %f\n", rhomin);
  MB_DPRINT("   maximum: %f\n", rhomax);
  MB_DPRINT("   mean   : %f\n", rhomean);
  MB_DPRINT("   r.m.s.d: %f\n", rhodev);

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
  Vector4D fcen;
  fcen.x() = (double(m_nStartCol)+double(m_nCols)/2.0)/double(m_nColInt);
  fcen.y() = (double(m_nStartRow)+double(m_nRows)/2.0)/double(m_nRowInt);
  fcen.z() = (double(m_nStartSec)+double(m_nSecs)/2.0)/double(m_nSecInt);
  
  m_xtalInfo.fracToOrth(fcen);
  return fcen;
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

LString DensityMap::getDataChunkReaderName() const
{
  return LString("qdfmap");
}

void DensityMap::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
  QdfDenMapWriter writer;
  writer.setEncType(oos.getQdfEncType());

  DensityMap *pthis = const_cast<DensityMap *>(this);
  writer.attach(qsys::ObjectPtr(pthis));
  writer.write(oos);
  writer.detach();
}


LString DensityMap::getNormHistogramJSON()
{
  double dbinw = m_dRmsdMap/10.0;
  int nbins = int( (m_dMaxMap-m_dMinMap)/dbinw );
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
        int ind = (int) ::floor( (rho-m_dMinMap)/dbinw );
        if (ind<0 || ind>=nbins) {
          MB_DPRINTLN("ERROR!! invalid density value at (%d,%d,%d)=%f", i,j,k,rho);
        }
        else {
          histo[ind]++;
        }
      }
        
  LString rval = "{";
  rval += LString::format("\"min\":%f,\n", m_dMinMap/m_dRmsdMap);
  rval += LString::format("\"max\":%f,\n", m_dMaxMap/m_dRmsdMap);
  rval += LString::format("\"nbin\":%d,\n", nbins);
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

