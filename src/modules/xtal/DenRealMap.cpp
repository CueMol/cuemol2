// -*-Mode: C++;-*-
//
// Density map object class
//
// $Id: DenRealMap.cpp,v 1.1 2010/01/16 15:32:08 rishitani Exp $

#include <common.hpp>
#include "DenRealMap.hpp"

// default constructor
DenRealMap::DenRealMap()
  : m_nColInt(0),m_nRowInt(0),m_nSecInt(0),
    m_nCols(0),m_nRows(0),m_nSecs(0),
    m_nStartCol(0),m_nStartRow(0),m_nStartSec(0),
    m_dMinMap(0.0), m_dMaxMap(0.0),
    m_dMeanMap(0.0), m_dRmsdMap(0.0),
    m_pRealMap(NULL)
{
}

DenRealMap::~DenRealMap()
{
  if (m_pRealMap!=NULL)
    delete m_pRealMap;
}

///////////////////////////////////////////////
// setup density map

// construct by float array
// col, row, sec ‚Í‚»‚ê‚¼‚ê x,y,zŽ²‚É
// ‘Î‰ž‚·‚é‚æ‚¤‚É“ü‚êŠ·‚¦‚ç‚ê‚Ä‚¢‚È‚¯‚ê‚Î‚È‚ç‚È‚¢
bool DenRealMap::setMapFloatArray(const float *array,
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

  if (m_pRealMap!=NULL)
    delete [] m_pRealMap;

  //
  //

  rotate(m_nCols,m_nRows,m_nSecs,axcol,axrow,axsect);

  m_pRealMap = new RealMap(m_nCols,m_nRows,m_nSecs);
  for (int k=0; k<nsect; k++)
    for (int j=0; j<nrow; j++)
      for (int i=0; i<ncol; i++) {
	double rho = (double)array[i + (j + k*nrow)*ncol];
	int ii=i,jj=j,kk=k;
	rotate(ii,jj,kk,axcol,axrow,axsect);
	m_pRealMap->at(ii,jj,kk) = rho;
      }


  MB_DPRINTLN("OK.");

  return true;
}

// setup column, row, section params
bool DenRealMap::setMapParams(int stacol, int starow, int stasect,
			      int intcol, int introw, int intsect)
{
  m_nStartCol = stacol;
  m_nStartRow = starow;
  m_nStartSec = stasect;

  m_nColInt = intcol;
  m_nRowInt = introw;
  m_nSecInt = intsect;

  return true;
}

// setup crystal system's parameters
bool DenRealMap::setXtalParams(double a, double b, double c,
			       double alpha, double beta, double gamma)
{
  m_xtalInfo.setCellDimension(a,b,c,alpha,beta,gamma);

  return true;
}


