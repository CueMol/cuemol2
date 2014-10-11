// $Id: ssm_superpose.cpp,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    30.04.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ssm_superpose  <interface>
//       ~~~~~~~~~
//  **** Functions : SuperposeCalphas ( superposing protein structures )
//       ~~~~~~~~~~~
//
//  (C) E. Krissinel 2002-2004
//
// =================================================================
//

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __MATH_H
#include <math.h>
#endif


#ifndef  __BFGS_Min__
#include <modules/molanl/mmdb/bfgs_min.h>
#endif

#ifndef  __SSM_Superpose__
#include "ssm_superpose.h"
#endif


//  =================================================================


Boolean SSpAtom::CompatibleSSE ( RSSpAtom a )  {
  if (sse==V_HELIX)   return  (a.sse==V_HELIX);
  return (a.sse!=V_HELIX);
}


void SSectionDist::Copy ( RSSectionDist D )  {
  dist      = D.dist;
  rmsd      = D.rmsd;
  cosine    = D.cosine;
  na        = D.na;
  core_pos1 = D.core_pos1;
  core_pos2 = D.core_pos2;
  core_e1   = D.core_e1;
  core_e2   = D.core_e2;
  pos1      = D.pos1;
  pos2      = D.pos2;
  e1        = D.e1;
  e2        = D.e2;
  sse1      = D.sse1;
  sse2      = D.sse2;
}


//  ==================================================================

void SSSEDesc::Transform ( mat44 & T )  {
  x1 = T[0][0]*xs1 + T[0][1]*ys1 + T[0][2]*zs1 + T[0][3];
  y1 = T[1][0]*xs1 + T[1][1]*ys1 + T[1][2]*zs1 + T[1][3];
  z1 = T[2][0]*xs1 + T[2][1]*ys1 + T[2][2]*zs1 + T[2][3];
  x2 = T[0][0]*xs2 + T[0][1]*ys2 + T[0][2]*zs2 + T[0][3];
  y2 = T[1][0]*xs2 + T[1][1]*ys2 + T[1][2]*zs2 + T[1][3];
  z2 = T[2][0]*xs2 + T[2][1]*ys2 + T[2][2]*zs2 + T[2][3];
}

void SSSEDesc::CalcScore ( RSSSEDesc D )  {
// Don't change this procedure without appropriate changing
// ChooseFirstRotation().
realtype dx,dy,dz;

  dx = x1 - D.x1;
  dy = y1 - D.y1;
  dz = z1 - D.z1;
  score = sqrt ( dx*dx + dy*dy + dz*dz );

  dx = x2 - D.x2;
  dy = y2 - D.y2;
  dz = z2 - D.z2;
  score += sqrt ( dx*dx + dy*dy + dz*dz );

  dx = ((x1+x2) - (D.x1+D.x2))/2.0;
  dy = ((y1+y2) - (D.y1+D.y2))/2.0;
  dz = ((z1+z2) - (D.z1+D.z2))/2.0;
  score += 2.0*sqrt(dx*dx+dy*dy+dz*dz);

  score  /= 16.0;
  D.score = score;

}


realtype GetVectorScore ( rvector r1, rvector v1,
                          rvector r2, rvector v2 )  {
//  r1, r2:  SSE origins
//  v1, v2:  SSE directions and lengths
vect3    r0,v0;
realtype vl2, t11,t12, t21,t22, dt1,dt2;
realtype dr, dr11,dr12,dr21,dr22, dr2,dl2;
int      i;

  vl2 = 0.0;
  t11 = 0.0;
  t12 = 0.0;
  t21 = 0.0;
  t22 = 0.0;
  for (i=0;i<3;i++)  {
    r0[i] = (r1[i]+r2[i])/2.0;         // medium r1 and r2
    v0[i] = (v1[i]+v2[i])/2.0;         // medium v1 and v2
    vl2  += v0[i]*v0[i];               // length of the medium
    t11  += v0[i]*(r1[i]-r0[i]);       // projection of r1 to medium
    t12  += v0[i]*(r1[i]+v1[i]-r0[i]); // projection of r1+v1 to medium
    t21  += v0[i]*(r2[i]-r0[i]);       // projection of r2 to medium
    t22  += v0[i]*(r2[i]+v2[i]-r0[i]); // projection of r2+v2 to medium
  }

  if (vl2<=0.0)  return -1.0;  // no score
  if ((t12<t11) || (t22<t21))  return -2.0;

  t11 /= vl2;
  t12 /= vl2;
  t21 /= vl2;
  t22 /= vl2;

  dr11 = 0.0;
  dr12 = 0.0;
  dr21 = 0.0;
  dr22 = 0.0;
  for (i=0;i<3;i++)  {
    dr = r1[i]-r0[i];         dr11 += dr*dr;
    dr = r1[i]+v1[i]-r0[i];   dr12 += dr*dr;
    dr = r2[i]-r0[i];         dr21 += dr*dr;
    dr = r2[i]+v2[i]-r0[i];   dr22 += dr*dr;
  }
  dr11 -= t11*t11*vl2;
  dr12 -= t12*t12*vl2;
  dr21 -= t21*t21*vl2;
  dr22 -= t22*t22*vl2;

  dr2 = RMax ( RMax(dr11,dr12),RMax(dr21,dr22) );

  dt1 = RMax ( t12-t11,t22-t21 );
  dt2 = RMax ( RMax(t11,t12),RMax(t21,t22) ) -
        RMin ( RMin(t11,t12),RMin(t21,t22) );

  dl2 = dt2-dt1;
  dl2 = dl2*dl2*vl2;

  return  dr2 + dl2;
  
}

realtype SSSEDesc::Cosine ( RSSSEDesc D )  {
realtype dx1,dy1,dz1, dx2,dy2,dz2, d1,d2,r;

  dx1 = x2 - x1;
  dy1 = y2 - y1;
  dz1 = z2 - z1;
  dx2 = D.x2 - D.x1;
  dy2 = D.y2 - D.y1;
  dz2 = D.z2 - D.z1;

  d1  = dx1*dx1 + dy1*dy1 + dz1*dz1;
  d2  = dx2*dx2 + dy2*dy2 + dz2*dz2;
  r   = d1*d2;

  if (r>0.0)  return  (dx1*dx2+dy1*dy2+dz1*dz2)/sqrt(r);
        else  return 1.0;

}

void SSSEDesc::Copy ( RSSSEDesc D )  {
  x1  = D.x1;    y1  = D.y1;    z1  = D.z1;
  x2  = D.x2;    y2  = D.y2;    z2  = D.z2;
  xs1 = D.xs1;   ys1 = D.ys1;   zs1 = D.zs1;
  xs2 = D.xs2;   ys2 = D.ys2;   zs2 = D.zs2;
  score   = D.score;
  Qscore  = D.Qscore;
  Rscore  = D.Rscore;
  Xscore  = D.Xscore;
  pos     = D.pos;
  len     = D.len;
  pend    = D.pend;
  type    = D.type;
  classID = D.classID;
  m       = D.m;
  match   = D.match;
}


//  ==================================================================

CSuperpose::CSuperpose()  {
  InitSuperpose();
  GetMatrixMemory ( A  ,3,3,1,1 );
  GetMatrixMemory ( U  ,3,3,1,1 );
  GetMatrixMemory ( V  ,3,3,1,1 );
  GetVectorMemory ( W  ,3,1     );
  GetVectorMemory ( RV1,3,1     );
}

CSuperpose::~CSuperpose()  {
  FreeMemory();
  FreeMatrixMemory ( A  ,3,1,1 );
  FreeMatrixMemory ( U  ,3,1,1 );
  FreeMatrixMemory ( V  ,3,1,1 );
  FreeVectorMemory ( W  ,1     );
  FreeVectorMemory ( RV1,1     );
  if (selString1)  delete[] selString1;
  if (selString2)  delete[] selString2;
  selString1 = NULL;
  selString2 = NULL;
}



void CSuperpose::InitSuperpose()  {

  Rmsd0         = 3.0;   // quality optimization parameter
  minContact    = 3.0;   // minimal Calpha-pair contact parameter
  maxContact    = 5.0;   // maximal Calpha-pair contact parameter
  maxRMSD       = 15.0;  // maximal RMSD allowed
  minCosine     = 0.7;   // minimum cosine between co-directional SSEs
  SSEweight     = 3.0;   // currently does not work
  sseGray       = 4;     // gray zone on the ends of SSEs allowed for
                         // matching to non-SSE atoms
  shortSect1    = 1;     // sections shorter than or equal to
                         // shortSect are removed
  shortSect2    = 2;
  iterMax       = 1000;
  iterMin       = 10;
  minQStep      = 0.00001; // minimal quality improvement that counts
  maxHollowIt   = 10;      // maximal allowed number of consequtive
                           // iterations without quality improvement
  allowMC       = False;   // do not allow for misconnections

  selInclHnd1   = 0;     // selection handle for included Calpha1
  selInclHnd2   = 0;     // selection handle for included Calpha2

  driverID      = 0;     // ID of the used Superpose driver

  selString1    = NULL;  // optional selection string for 1st structure
  selString2    = NULL;  // optional selection string for 2nd structure

  a1            = NULL;
  a2            = NULL;
  nres1         = 0;
  nres2         = 0;
  nalgn         = 0;
  ngaps         = 0;
  nmd           = 0;
  rmsd_achieved = -1.0;
  Q_achieved    = -1.0;
  nmisdr        = 0;
  seqIdent      = 0.0;
  ncombs        = 1.0;

  Calpha1       = NULL;
  Calpha2       = NULL;

  SSED1         = NULL;
  SSED2         = NULL;
  FH1           = NULL;
  FS1           = NULL;
  FH2           = NULL;
  FS2           = NULL;
  nSSEs1        = 0;
  nSSEs2        = 0;
  nFH1          = 0;
  nFS1          = 0;
  nFH2          = 0;
  nFS2          = 0;

  SDist         = NULL;
  SDistAlloc    = 0;

}

void CSuperpose::FreeMemory()  {
int i;

  if (a1)  {
    delete[] a1;
    a1 = NULL;
  }
  if (a2)  {
    delete[] a2;
    a2 = NULL;
  }
  nres1  = 0;
  nres2  = 0;
  nalgn  = 0;
  ngaps  = 0;
  rmsd_achieved = -1.0;
  Q_achieved    = -1.0;

  if (SSED1)  delete[] SSED1;
  if (SSED2)  delete[] SSED2;
  SSED1  = NULL;
  SSED2  = NULL;

  FreeVectorMemory ( FH1,1 );
  FreeVectorMemory ( FS1,1 );
  FreeVectorMemory ( FH2,1 );
  FreeVectorMemory ( FS2,1 );
  nSSEs1 = 0;
  nSSEs2 = 0;
  nFH1   = 0;
  nFS1   = 0;
  nFH2   = 0;
  nFS2   = 0;

  if (SDist)  {
    for (i=0;i<SDistAlloc;i++)
      if (SDist[i])  delete SDist[i];
    delete[] SDist;
    SDist = NULL;
  }
  SDistAlloc = 0;

}

void CSuperpose::SetAllowMC ( Boolean allowMisconnections )  {
  allowMC = allowMisconnections;
}

void CSuperpose::SetIterationLimits ( int iter_max, int iter_min,
                                      int max_hollow )  {
  iterMax     = iter_max;
  iterMin     = iter_min;
  maxHollowIt = max_hollow;
}

void  CSuperpose::SetCaSelections ( pstr selection1, pstr selection2 )  {
  CreateCopy ( selString1,selection1 );
  CreateCopy ( selString2,selection2 );
}

void  CSuperpose::GetTMatrix ( mat44 & TMat )  {
int i,j;
  for (i=0;i<4;i++)
    for (j=0;j<4;j++)
      TMat[i][j] = TMatrix[i][j];
}

mat44 * CSuperpose::GetTMatrix()  {
  return &TMatrix;
}

realtype CSuperpose::GetRMSD()  {
  if (a1 && a2)  return rmsd_achieved;
           else  return -1.0;
}

int  CSuperpose::GetNAlign()  {
  if (a1 && a2)  return nalgn;
           else  return -1;
}


void  CSuperpose::GetSuperposition ( ivector  & Ca1  ,
                                     rvector  & dist1, int & nCa1,
                                     ivector  & Ca2  , int & nCa2,
                                     mat44    & TMat ,
                                     realtype & rmsdAchieved,
                                     int & nAligned,   int & nGaps,
                                     realtype & seqIdentity,
                                     int & nMisD, realtype & nCombs )  {
//
//   Ca1[i]>=0 gives the index of Calpha of 2nd structure,
// superposed on ith Calpha of 1st structure (0<=i<nres1).
// If ith Calpha was not superposed then Ca1[i]<0.
//
//   For superposed atoms
//      Ca2[Ca1[i]] = i
//      Ca1[Ca2[j]] = j
//
//   Ca1 and Ca2 are dynamically allocated (indexed from 0 on)
// and should be disposed by the application. If Ca1 and/or Ca2
// are not initially set NULL, GetSuperposition attempts to
// dispose them first.
//
int i,j;
  FreeVectorMemory ( Ca1  ,0 );
  FreeVectorMemory ( dist1,0 );
  FreeVectorMemory ( Ca2  ,0 );
  if (a1 && a2)  {
    GetVectorMemory ( Ca1  ,nres1,0 );
    GetVectorMemory ( dist1,nres1,0 );
    GetVectorMemory ( Ca2  ,nres2,0 );
    for (i=0;i<nres1;i++)  {
      Ca1[i] = a1[i].c0;
      if (Ca1[i]>=0)  dist1[i] = sqrt(a1[i].dist0);
                else  dist1[i] = -1.0;
    }
    for (i=0;i<nres2;i++)  Ca2[i] = a2[i].c0;
    for (i=0;i<4;i++)
      for (j=0;j<4;j++)
        TMat[i][j] = TMatrix[i][j];
    nCa1         = nres1;
    nCa2         = nres2;
    rmsdAchieved = rmsd_achieved;
    nAligned     = nalgn;
    nGaps        = ngaps;
    seqIdentity  = seqIdent;
    nMisD        = nmd;
    nCombs       = ncombs;
  } else  {
    for (i=0;i<4;i++)  {
      for (j=0;j<4;j++)
        TMat[i][j] = 0.0;
      TMat[i][i] = 1.0;
    }
    nCa1         = 0;
    nCa2         = 0;
    rmsdAchieved = -1.0;
    nAligned     = 0;
    nGaps        = 0;
    seqIdentity  = 0.0;
    nMisD        = 0;
    nCombs       = 1.0;
  }
}

void CSuperpose::GetSSEDesc1 ( RPSSSEDesc SSEDesc, int & numSSEs )  {
int i;
  if (SSEDesc)  delete[] SSEDesc;
  SSEDesc = new SSSEDesc[nSSEs1];
  for (i=0;i<nSSEs1;i++)
    SSEDesc[i].Copy ( SSED1[i] );
  numSSEs = nSSEs1;
}

PSSSEDesc CSuperpose::GetSSEDesc1()  {
  return SSED1;
}

void CSuperpose::GetSSEDesc2 ( RPSSSEDesc SSEDesc, int & numSSEs )  {
int i;
  if (SSEDesc)  delete[] SSEDesc;
  SSEDesc = new SSSEDesc[nSSEs2];
  for (i=0;i<nSSEs2;i++)
    SSEDesc[i].Copy ( SSED2[i] );
  numSSEs = nSSEs2;
}

PSSSEDesc CSuperpose::GetSSEDesc2()  {
  return SSED2;
}

void CSuperpose::GetSuperposedSSEs ( ivector v1, ivector v2,
                                     int & nSupSSEs )  {
int i;
  nSupSSEs = 0;
  for (i=0;i<nSSEs1;i++)
    if (SSED1[i].match>0)  {
      nSupSSEs++;
      v1[nSupSSEs] = i+1;
      v2[nSupSSEs] = SSED1[i].match;
    }
}

int  CSuperpose::CalculateTMatrix()  {
realtype det,B;
int      i,j,k;

  det = A[1][1]*A[2][2]*A[3][3] + 
        A[1][2]*A[2][3]*A[3][1] +
        A[2][1]*A[3][2]*A[1][3] -
        A[1][3]*A[2][2]*A[3][1] -
        A[1][1]*A[2][3]*A[3][2] -
        A[3][3]*A[1][2]*A[2][1];

  SVD ( 3,3,3,A,U,V,W,RV1,True,True,i );

  if (i!=0) {
    for (j=0;j<4;j++)  {
      for (k=0;k<4;k++)
        TMatrix[j][k] = 0.0;
      TMatrix[j][j] = 1.0;
    }
    return 1;
  }

  if (det<=0.0)  {
    k = 0;
    B = MaxReal;
    for (j=1;j<=3;j++)
      if (W[j]<B)  {
        B = W[j];
        k = j;
      }
    for (j=1;j<=3;j++)
      V[j][k] = -V[j][k];
  }

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)  {
      B = 0.0;
      for (i=1;i<=3;i++)
        B += U[j][i]*V[k][i];
      TMatrix[j-1][k-1] = B;
    }

  TMatrix[3][0] = 0.0;
  TMatrix[3][1] = 0.0;
  TMatrix[3][2] = 0.0;
  TMatrix[3][3] = 1.0;

  return 0;

}


DefineStructure(SMinTFunc)

struct SMinTFunc  {
  vect3 *  r1;
  vect3 *  v1;
  vect3 *  r2;
  vect3 *  v2;
  int      nV;
  void  Init     ();
  void  Allocate ( int nVectors );
  void  Dispose  ();
};

void SMinTFunc::Init()  {
  r1 = NULL;  v1 = NULL;
  r2 = NULL;  v2 = NULL;
  nV = 0;
}

void SMinTFunc::Allocate ( int nVectors )  {
  Dispose();
  nV = nVectors;
  if (nV>0)  {
    r1 = new vect3[nV];
    v1 = new vect3[nV];
    r2 = new vect3[nV];
    v2 = new vect3[nV];
  }
}

void SMinTFunc::Dispose()  {
  if (r1)  delete[] r1;
  if (v1)  delete[] v1;
  if (r2)  delete[] r2;
  if (v2)  delete[] v2;
  Init();
}

void  MinTFunc ( void * Data, int N, rvector X, realtype & F )  {
PSMinTFunc MTFD;
mat33      erm;
vect3      r1,v1;
realtype   rr,vv, score;
int        i,j,k;

  MTFD = PSMinTFunc(Data);

  GetEulerRotMatrix ( erm,X[4],X[5],X[6] );

  F = 0.0;
  for (i=0;i<MTFD->nV;i++)  {
    for (j=0;j<3;j++)  {
      rr = X[j+1];
      vv = 0.0;
      for (k=0;k<3;k++)  {
        rr += erm[j][k]*MTFD->r1[i][k];
        vv += erm[j][k]*MTFD->v1[i][k];
      }
      r1[j] = rr;
      v1[j] = vv;
    }
    score = GetVectorScore ( r1,v1,MTFD->r2[i],MTFD->v2[i] );
    if (score>0.0)  F += score;
  }
}

int  CSuperpose::SuperposeSSGraphs ( PCSSGraph G1, ivector F1,
                                     PCSSGraph G2, ivector F2,
                                     int matchlen )  {
PCBFGSMin  BFGS;
SMinTFunc  SMTF;
PCSSVertex Vx;
mat33      erm,trm;
vect3      v1,v2;
realtype   T[7],TypT[7];
realtype   B,B1, x01,y01,z01, x02,y02,z02, mass,mass1,mass2;
int        i,j,k,l, nE1,nE2;
Boolean    AddEdges1,AddEdges2;

  nE1 = G1->GetNofEdges();
  if (!nE1)  G1->BuildGraph();

  nE2 = G2->GetNofEdges();
  if (!nE2)  G2->BuildGraph();

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)
      A[j][k] = 0.0;

  for (i=1;i<=matchlen;i++)  {
    Vx = G1->GetGraphVertex ( F1[i] );
    Vx->GetDirection ( v1 );
    B  = Vx->GetMass();
    Vx = G2->GetGraphVertex ( F2[i] );
    Vx->GetDirection ( v2 );
    B += Vx->GetMass();
    for (j=1;j<=3;j++)
      for (k=1;k<=3;k++)
        A[j][k] += B*v1[k-1]*v2[j-1];
  }

  AddEdges1 = True;
  for (i=1;(i<matchlen) && AddEdges1;i++)  {
    Vx = G1->GetGraphVertex ( F1[i] );
    for (l=i+1;(l<=matchlen) && AddEdges1;l++)  {
      B = Vx->GetCosine ( G1->GetGraphVertex(F1[l]) );
      if (fabs(B)<0.8)  AddEdges1 = False;
    }
  }

  AddEdges2 = True;
  for (i=1;(i<matchlen) && AddEdges2;i++)  {
    Vx = G2->GetGraphVertex ( F2[i] );
    for (l=i+1;(l<=matchlen) && AddEdges2;l++)  {
      B = Vx->GetCosine ( G2->GetGraphVertex(F2[l]) );
      if (fabs(B)<0.8)  AddEdges2 = False;
    }
  }

  if (AddEdges1 || AddEdges2)
    for (i=1;i<matchlen;i++)
      for (l=i+1;l<=matchlen;l++)
        if (G1->GetEdgeDirection(F1[i],F1[l],v1) &&
            G2->GetEdgeDirection(F2[i],F2[l],v2))  {
          B = (G1->GetMass(F1[i]) + G1->GetMass(F1[l]) +
               G2->GetMass(F2[i]) + G2->GetMass(F2[l]))/2.0;
          for (j=1;j<=3;j++)
            for (k=1;k<=3;k++)
              A[j][k] += B*v1[k-1]*v2[j-1];
        }


  if (CalculateTMatrix())  return 1;


  //  9. Add translation
  x01 = 0.0;   y01 = 0.0;   z01 = 0.0;  mass1 = 0.0;
  x02 = 0.0;   y02 = 0.0;   z02 = 0.0;  mass2 = 0.0;
  for (i=1;i<=matchlen;i++)  {
    Vx     = G1->GetGraphVertex ( F1[i] );
    mass   = Vx->GetMass();
    Vx->GetPosition ( v1 );
    x01   += v1[0]*mass;
    y01   += v1[1]*mass;
    z01   += v1[2]*mass;
    mass1 += mass;
    Vx     = G2->GetGraphVertex ( F2[i] );
    mass   = Vx->GetMass();
    Vx->GetPosition ( v2 );
    x02   += v2[0]*mass;
    y02   += v2[1]*mass;
    z02   += v2[2]*mass;
    mass2 += mass;
  }
  x01 /= mass1;   y01 /= mass1;  z01 /= mass1;
  x02 /= mass2;   y02 /= mass2;  z02 /= mass2;

  //  10. Optimize translation

  for (i=0;i<7;i++)  {
    T   [i] = 0.0;
    TypT[i] = 1.0;
  }

  SMTF.Init();
  SMTF.Allocate ( matchlen );
  //  Bring both structures' mass centers into (0,0,0) and
  //  superpose
  for (i=0;i<matchlen;i++)  {
    Vx = G1->GetGraphVertex ( F1[i+1] );
    v1[0]  = Vx->GetX1();
    v1[1]  = Vx->GetY1();
    v1[2]  = Vx->GetZ1();
    v2[0]  = Vx->GetX2() - v1[0];
    v2[1]  = Vx->GetY2() - v1[1];
    v2[2]  = Vx->GetZ2() - v1[2];
    v1[0] -= x01;
    v1[1] -= y01;
    v1[2] -= z01;
    for (j=0;j<3;j++)  {
      B  = 0.0;
      B1 = 0.0;
      for (k=0;k<3;k++)  {
        B  += TMatrix[j][k]*v1[k];
        B1 += TMatrix[j][k]*v2[k];
      }
      SMTF.r1[i][j] = B;
      SMTF.v1[i][j] = B1;
    }
    Vx = G2->GetGraphVertex ( F2[i+1] );
    SMTF.r2[i][0]  = Vx->GetX1();
    SMTF.r2[i][1]  = Vx->GetY1();
    SMTF.r2[i][2]  = Vx->GetZ1();
    SMTF.v2[i][0]  = Vx->GetX2() - SMTF.r2[i][0];
    SMTF.v2[i][1]  = Vx->GetY2() - SMTF.r2[i][1];
    SMTF.v2[i][2]  = Vx->GetZ2() - SMTF.r2[i][2];
    SMTF.r2[i][0] -= x02;
    SMTF.r2[i][1] -= y02;
    SMTF.r2[i][2] -= z02;
  }

  BFGS = new CBFGSMin();

  BFGS->SetMinFunction ( &SMTF,MinTFunc );

  BFGS->BFGS_Driver ( 6,T,TypT,B,i,    // MinN,x0,TypX,FuncValue,TermCode
                      0,100,1.0,       // Digits,ItnLmt,TypF
                      0.0,0.0,MaxReal, // GrdTol,StpTol,MaxStp
                      False,NULL,NULL  // Hess,LowLimit,TopLimit
                    );

  delete BFGS;

  SMTF.Dispose();

  GetEulerRotMatrix ( erm,T[4],T[5],T[6] );

  for (i=0;i<3;i++)
    for (j=0;j<3;j++)  {
      B = 0.0;
      for (k=0;k<3;k++)
        B += erm[i][k]*TMatrix[k][j];
      trm[i][j] = B;
    }

  TMatrix[0][3] = x02 - TMatrix[0][0]*x01 - TMatrix[0][1]*y01 -
                        TMatrix[0][2]*z01 - T[1];
  TMatrix[1][3] = y02 - TMatrix[1][0]*x01 - TMatrix[1][1]*y01 -
                        TMatrix[1][2]*z01 - T[2];
  TMatrix[2][3] = z02 - TMatrix[2][0]*x01 - TMatrix[2][1]*y01 -
                        TMatrix[2][2]*z01 - T[3];

  if (!nE1)  G1->ReleaseEdges();
  if (!nE2)  G2->ReleaseEdges();

  return 0;

}


void CSuperpose::SelectCalphas ( PCMMDBManager MMDB, PCSSGraph G,
                                 PPCAtom & Calpha, PSSpAtom & a,
                                 int & nres, int & selHnd,
                                 int selInclHnd, pstr selString )  {
int i;

  if (a && (driverID!=2))  {
    delete[] a;
    a = NULL;
  }

  if ((selHnd<=0) || (driverID!=2))  {
    G->SelectCalphas  ( MMDB,selHnd,selString );
    MMDB->GetSelIndex ( selHnd,Calpha,nres );
  }

  if (nres>0)  {
    if (!a)  {
      a = new SSpAtom[nres];
      for (i=0;i<nres;i++)  {
        strcpy ( a[i].chID,Calpha[i]->GetChainID() );
        a[i].sse   = V_UNKNOWN;
        a[i].c0    = -1;
        a[i].dist  = -1.0;
        a[i].dist0 = -1.0;
        if (selInclHnd>0)
             a[i].excluded = !Calpha[i]->isInSelection ( selInclHnd );
        else a[i].excluded = False;
      }
    } else  {
      for (i=0;i<nres;i++)  {
        a[i].c0    = -1;
        a[i].dist  = -1.0;
        a[i].dist0 = -1.0;
        if (selInclHnd>0)
             a[i].excluded = !Calpha[i]->isInSelection ( selInclHnd );
        else a[i].excluded = False;
      }
    }
  }

}


void CSuperpose::MapSSEs ( PPCAtom Calpha, PSSpAtom a, int nres,
                           PCSSGraph G, RPSSSEDesc SSED, int & nSSEs )  {
//  Returns vector SSED.pos containing the origin of SSE sequences in
//  array a, and vector SSED.len containing the SSEs' lengths.
//  nSSEs returns the number of SSEs.
PCSSVertex V;
ChainID    chID;
int        initSeqNum,endSeqNum,seqNum;
InsCode    initICode,endICode;
pstr       iCode;
int        i,j,vtype,k, p1,p2, c1,c2;

  if (SSED && (driverID!=2))  {
    delete[] SSED;
    SSED = NULL;
  }

  nSSEs = G->GetNofVertices();
  if (nSSEs<=0)  return;

  if (!SSED)  {

    SSED = new SSSEDesc[nSSEs];
  
    for (i=1;i<=nSSEs;i++)  {
      G->GetVertexRange ( i,chID,initSeqNum,initICode,endSeqNum,endICode );
      vtype = G->GetVertexType(i);
      p1 = -1;
      p2 = -1;
      c1 = -1;
      c2 = -1;
      for (j=0;(j<nres) && ((p2<0) || (p1<0));j++)  {
        if (!strcmp(chID,Calpha[j]->GetChainID()))  {
          if (c1<0)  c1 = j;
          c2 = j;
          seqNum = Calpha[j]->GetSeqNum ();
          iCode  = Calpha[j]->GetInsCode();
          if ((p1<0) && (initSeqNum==seqNum) && (!strcmp(initICode,iCode)))
              p1 = j;
          if ((p2<0) && (endSeqNum==seqNum) && (!strcmp(endICode,iCode)))
              p2 = j;
        }
      }
      k = i-1;
      if ((p1>=0) && (p2<0))  p2 = c2;
      if ((p1<0) && (p2>=0))  p1 = c1;
      if ((p1>=0) && (p2>=0))  {
        if (p2<p1)  {
          j  = p1;
          p1 = p2;
          p2 = j;
        }
        SSED[k].pos  = p1;
        SSED[k].pend = p2;
        SSED[k].len  = p2-p1+1;
        for (j=p1+sseGray;j<=p2-sseGray;j++)
          a[j].sse = vtype;
      } else  {
        SSED[k].pos  = -1;
        SSED[k].pend = -1;
        SSED[k].len  = 0;
      }
      V = G->GetGraphVertex ( i );
      if (V)  {
        SSED[k].x1 = V->GetX1();
        SSED[k].x2 = V->GetX2();
        SSED[k].y1 = V->GetY1();
        SSED[k].y2 = V->GetY2();
        SSED[k].z1 = V->GetZ1();
        SSED[k].z2 = V->GetZ2();
      } else  {
        SSED[k].x1 = 0.0;
        SSED[k].x2 = 0.0;
        SSED[k].y1 = 0.0;
        SSED[k].y2 = 0.0;
        SSED[k].z1 = 0.0;
        SSED[k].z2 = 0.0;
      }
      SSED[k].xs1     = SSED[k].x1;
      SSED[k].xs2     = SSED[k].x2;
      SSED[k].ys1     = SSED[k].y1;
      SSED[k].ys2     = SSED[k].y2;
      SSED[k].zs1     = SSED[k].z1;
      SSED[k].zs2     = SSED[k].z2;
      SSED[k].type    = vtype;
      SSED[k].classID = G->GetVertexClass(i);
      SSED[k].score   = MaxReal;
      SSED[k].Qscore  = 0.0;
      SSED[k].Rscore  = 0.0;
      SSED[k].Xscore  = 0.0;
      SSED[k].m       = -1;
      SSED[k].match   = -1;
    }

  } else  {

    for (i=0;i<nSSEs;i++)  {
      SSED[i].score   = MaxReal;
      SSED[i].Qscore  = 0.0;
      SSED[i].Rscore  = 0.0;
      SSED[i].Xscore  = 0.0;
      SSED[i].m       = -1;
      SSED[i].match   = -1;
    }

  }

}


void  CSuperpose::IdentifyUnmatchedSSEs ( ivector & FH, int & nFH,
                                          ivector & FS, int & nFS,
                                          ivector F, int mlen,
                                          PCSSGraph G )  {
int i,j,k,nSSEs;

  FreeVectorMemory ( FH,1 );
  FreeVectorMemory ( FS,1 );

  nSSEs = G->GetNofVertices();
  if (nSSEs<=0)  return;

  GetVectorMemory ( FH,nSSEs,1 );
  GetVectorMemory ( FS,nSSEs,1 );
  nFH = 0;
  nFS = 0;
  for (i=1;i<=nSSEs;i++)  {
    k = 0;
    for (j=1;(j<=mlen) && (!k);j++)
      if (F[j]==i)  k = j;
    if (!k)  {
      if (G->GetVertexType(i)==V_HELIX)  FH[++nFH] = i;
                                   else  FS[++nFS] = i;
    }
  }

}


void  CSuperpose::CalcDistance ( int SSE1, int SSE2,
                                 RSSectionDist D )  {
//    Calculates the minimal distance between SSEs number SSE1
//  and SSE2 from pos1 to pos1+len1-1 and pos2 to pos2+len2-1,
//  as given in the SSE description arrays, SSED1 and SSED2,
//  respectively. The distance is returned in D together with
//  other parameters needed for 3D alignment of the SSEs.
realtype d,d1;
int      minAlign, pos1,pos2, len1,len2, i,j,k,l, i1,i2;
int      p1,p2,e1,e2;


  //  1. Initial preparations

  i1   = SSE1-1;
  i2   = SSE2-1;
  pos1 = SSED1[i1].pos;
  pos2 = SSED2[i2].pos;
  len1 = SSED1[i1].len;
  len2 = SSED2[i2].len;

  //  store indices of SSEs for future references
  D.sse1 = SSE1;
  D.sse2 = SSE2;

  if ((len1<=0) || (len2<=0))  {
    D.dist      = MaxReal;
    D.rmsd      = MaxReal;
    D.cosine    = -1.0;
    D.core_pos1 = -1;
    D.core_pos2 = -1;
    D.core_e1   = -1;
    D.core_e2   = -1;
    D.na        = 0;
    D.pos1      = -1;
    D.pos2      = -1;
    D.e1        = -1;
    D.e2        = -1;
    return;
  }

  //  we require that at least minAlign Calphas from each SSE
  //  are corresponded
  if (SSED1[i1].type==V_HELIX)  minAlign = 4; //hx_min_len;
                          else  minAlign = 3; //sd_min_len;

  minAlign = IMin ( minAlign,len1 );
  minAlign = IMin ( minAlign,len2 );

  //  calculate cosine between SSE main vectors
  D.cosine = SSED1[i1].Cosine ( SSED2[i2] );


  //  2. Calculate the square distance matrix

  i1 = pos1;
  for (i=0;i<len1;i++)  {
    i2 = pos2;
    for (j=0;j<len2;j++)
      AD[i][j] = Calpha1[i1]->GetDist2 ( Calpha2[i2++] );
    i1++;
  }


  //  3. Look for minAlign-long section with minimal rmsd

  d  = MaxReal;
  p1 = -1;
  p2 = -1;

  for (i=0;i<=len1-minAlign;i++)  {
    l = IMin(len1-i,len2) - minAlign;
    for (j=0;j<=l;j++)  {
      d1 = 0.0;
      for (k=j;k<j+minAlign;k++)
        d1 += AD[i+k][k];
      if (d1<d)  {
        d  = d1;
        p1 = i + j;
        p2 = j;
      }
    }
  }

  for (j=0;j<=len2-minAlign;j++)  {
    l = IMin(len2-j,len1) - minAlign;
    for (i=0;i<=l;i++)  {
      d1 = 0.0;
      for (k=i;k<i+minAlign;k++)
        d1 += AD[k][j+k];
      if (d1<d)  {
        d  = d1;
        p1 = i;
        p2 = j+i;
      }
    }
  }

  D.core_pos1 = pos1 + p1;
  D.core_pos2 = pos2 + p2;
  D.core_e1   = D.core_pos1 + minAlign - 1;
  D.core_e2   = D.core_pos2 + minAlign - 1;

  if (p1>=0)  D.na = minAlign;
        else  D.na = 0;

  D.dist      = d;
  D.rmsd      = d/minAlign;

  //  4. Expand the initial alignment section into both directions

  l = IMin ( p1,p2 );
  D.pos1 = D.core_pos1 - l;
  D.pos2 = D.core_pos2 - l;

  l = IMin ( pos1+len1-D.core_e1,pos2+len2-D.core_e2 ) - 1;
  D.e1   = D.core_e1   + l;
  D.e2   = D.core_e2   + l;

}


void  CSuperpose::AlignSSEs ( RSSectionDist D, int unmap )  {
//    Makes correspondence between sections of atoms in arrays Calpha1
//  and Calpha2 from pos1 to pos1+len1-1 and pos2 to pos2+len2-1,
//  respectively using data obtained from calcDistance.
//    The correspondence is returned as pairs  c2[c1[i]]=i and
//  c1[c2[j]]=j for atoms i and j; c1[k] and c2[m] for non-corresponding
//  atoms k and m are not changed.
int  i1,i2, c1;

  if (D.na>0)  {

    i1 = D.pos1;
    i2 = D.pos2;
    c1 = D.core_pos1;
    if (unmap!=UNMAP_NO)  c1 = (c1+D.core_e1)/2;

    while (i1<c1)  {
      a1[i1].c = i2;
      a2[i2].c = i1;
      if (i1>D.pos1)  {
        a1[i1].unmap1 = D.pos1;  // do not unmap
        a1[i1].unmap2 = i1-1;    //   until any of
        a2[i2].unmap1 = D.pos2;  //     previous atoms
        a2[i2].unmap2 = i2-1;    //       is unmapped
      }
      a1[i1].dist = Calpha1[i1]->GetDist2 ( Calpha2[i2] );
      a2[i2].dist = a1[i1].dist;
      i1++;
      i2++;
    }

    if (unmap==UNMAP_NO)
      while (i1<=D.core_e1)  {
        a1[i1].c      = i2;
        a2[i2].c      = i1;
        a1[i1].unmap1 = unmap;
        a1[i1].unmap2 = unmap;
        a2[i2].unmap1 = unmap;
        a2[i2].unmap2 = unmap;
        a1[i1].dist   = Calpha1[i1]->GetDist2 ( Calpha2[i2] );
        a2[i2].dist   = a1[i1].dist;
        i1++;
        i2++;
      }

    while (i1<=D.e1)  {
      a1[i1].c = i2;
      a2[i2].c = i1;
      if (i1<D.e1)  {
        a1[i1].unmap1 = i1+1;  // do not unmap
        a1[i1].unmap2 = D.e1;  //   until any of
        a2[i2].unmap1 = i2+1;  //     next atoms
        a2[i2].unmap2 = D.e2;  //       is unmapped
      }
      a1[i1].dist = Calpha1[i1]->GetDist2 ( Calpha2[i2] );
      a2[i2].dist = a1[i1].dist;
      i1++;
      i2++;
    }

    SSED1[D.sse1-1].m = D.sse2;
    SSED2[D.sse2-1].m = D.sse1;

  }

}

Boolean  CSuperpose::isMC ( int pos1, int pos2 )  {
//   Returns True if matching the Calpha pair in the positions
// (pos1,pos2) of the chains would contradict to the already
// aligned pairs and allowMC is set False.
int i;

  if (allowMC)  return False;
//  if ((pos1<0) || (pos2<0)) return False;  //  to be removed 30.03.2003

  i = pos1 + 1;
  while (i<nres1)
    if (a1[i].c>=0)  break;
               else  i++;
  if (i<nres1) {
    if (pos2>=a1[i].c)  {
      if ((!strcmp(a1[pos1].chID,a1[i].chID)) &&
          (!strcmp(a2[pos2].chID,a2[a1[i].c].chID)))
        return True;
    }
  }

  i = pos1 - 1;
  while (i>=0)
    if (a1[i].c>=0)  break;
               else  i--;
  if (i>=0) {
    if (pos2<=a1[i].c)  {
      if ((!strcmp(a1[pos1].chID,a1[i].chID)) &&
          (!strcmp(a2[pos2].chID,a2[a1[i].c].chID)))
        return True;
    }
  }

  return False;

}

void  CSuperpose::CorrespondSSEs ( ivector F1, int nF1,
                                   ivector F2, int nF2,
                                   realtype rmsd_est )  {
realtype rmsd,rmsd2;
int      i,j, k1,k2, i1,j1;

  rmsd2 = rmsd_est*rmsd_est;

  for (i=1;i<=nF1;i++)  {
    i1 = i-1;
    k1 = F1[i]-1;
    for (j=1;j<=nF2;j++)  {
      j1 = j-1;
      k2 = F2[j]-1;
      if ((SSED1[k1].type==SSED2[k2].type) &&
          (SSED1[k1].classID==SSED2[k2].classID) &&
          (!isMC(SSED1[k1].pos,SSED2[k2].pos)))  {
        CalcDistance ( F1[i],F2[j],SDist[i1][j1] );
        if ((SDist[i1][j1].na<=0) || (SDist[i1][j1].cosine<minCosine) ||
            (SDist[i1][j1].rmsd>rmsd2))
          SDist[i1][j1].rmsd = -1.0;
      } else
        SDist[i1][j1].rmsd = -1.0;
    }
  }

  do  {
    rmsd = MaxReal;
    i1   = -1;
    j1   = -1;
    for (i=0;i<nF1;i++)
      for (j=0;j<nF2;j++)
        if ((SDist[i][j].rmsd>=0.0) && (SDist[i][j].rmsd<rmsd) &&
            (!isMC(SDist[i][j].pos1,SDist[i][j].pos2)))  {
          rmsd = SDist[i][j].rmsd;
          i1 = i;
          j1 = j;
        }
    if (i1>=0)  {
      AlignSSEs ( SDist[i1][j1],UNMAP_YES );
      for (j=0;i<nF2;i++)
        SDist[i1][j].rmsd = -1.0;
      for (i=0;i<nF1;i++)
        SDist[i][j1].rmsd = -1.0;
    }
  } while (i1>=0);

}


void  CSuperpose::ExpandContact ( RSContact c, int & ip, int & im,
                                  realtype maxDist2 )  {
//  ip expands contact (c.id1,c.id2) in positive direction of indices
//  im expands contact (c.id1,c.id2) in negative direction of indices
//  once ip reaches end of the chain, it is assigned -1
//  once im reaches begining of the chain, it is assigned -1
realtype dist;
int      i1,i2;

  if (ip>=0)  {
    i1 = c.id1 + ip;
    i2 = c.id2 + ip;
    if (!isMC(i1,i2))  {
      while ((i1<nres1) && (i2<nres2))
        if ((a1[i1].c<0) && (a2[i2].c<0) && 
             a1[i1].CompatibleSSE(a2[i2])) {
          dist = Calpha1[i1]->GetDist2 ( Calpha2[i2] );
          if (dist<maxDist2)  {
            a1[i1].c    = i2;
            a2[i2].c    = i1;
            a1[i1].dist = dist;
            a2[i2].dist = dist;
            i1++;
            i2++;
          } else
            break;
        } else
          i1 = nres1;
    } else
      i1 = nres1;
    if ((i1<nres1) && (i2<nres2))  ip = i1 - c.id1;
                             else  ip = -1;
  }

  if (im>=0)  {
    i1 = c.id1 - im;
    i2 = c.id2 - im;
    if (!isMC(i1,i2))  {
      while ((i1>=0) && (i2>=0))
        if ((a1[i1].c<0) && (a2[i2].c<0) &&
             a1[i1].CompatibleSSE(a2[i2])) {
          dist = Calpha1[i1]->GetDist2 ( Calpha2[i2] );
          if (Calpha1[i1]->GetDist2(Calpha2[i2])<maxDist2)  {
            a1[i1].c    = i2;
            a2[i2].c    = i1;
            a1[i1].dist = dist;
            a2[i2].dist = dist;
            i1--;
            i2--;
          } else
            break;
        } else
          i1 = -1;
    } else
      i1 = -1;
    if ((i1>=0) && (i2>=0))  im = c.id1 - i1;
                       else  im = -1;
  }

}



void  CSuperpose::CorrespondContacts ( PCMMDBManager M1,
                                       realtype rmsd_est )  {
//  Find the closest contacts between yet unmapped atoms
//  and gradually expand them
PSContact contact;
ivector   ip,im;
vect3     v1,v2;
realtype  l1,l2,cosine;
int       ncontacts,i,j,k,m1,m2,n1,n2,i1,i2;

  //  1. Find all contacts in the range og 0.0 - Rmsd
  contact   = NULL;
  ncontacts = 0;
  M1->SeekContacts ( Calpha1,nres1,Calpha2,nres2,0.0,rmsd_est,0,
                     contact,ncontacts,0,NULL,0,
                     BRICK_ON_2 | BRICK_READY );

  //  2. Leave only open contacts (i.e. those between yet unmapped atoms),
  //     with regard to the SSE type
  j = 0;
  for (i=0;i<ncontacts;i++)  {
    i1 = contact[i].id1;
    i2 = contact[i].id2;
    if ((a1[i1].c<0) && (a2[i2].c<0) && a1[i1].CompatibleSSE(a2[i2]))  {
      if (j<i)  contact[j].Copy ( contact[i] );
      contact[j].dist = contact[j].dist*contact[j].dist;
      j++;
    }
  }
  ncontacts = j;


  //  3. Leave only unique shortest contacts, that is, if a1[i]-a2[j]
  //     is the shortest contact for atom a1[i], it has also to be
  //     the shortest contact for atom a2[j].

  if (ncontacts>0)  {

    SortContacts ( contact,ncontacts,CNSORT_DINC );

    // get memory for contact expansion shifts
    GetVectorMemory ( ip,ncontacts,0 );
    GetVectorMemory ( im,ncontacts,0 );

    j = 0;
    for (i=0;i<ncontacts;i++)  {
      i1 = contact[i].id1;
      i2 = contact[i].id2;
      if ((a1[i1].c<0) && (a2[i2].c<0) && (!isMC(i1,i2)))  {
        // check that chains contact at sufficiently small angle
        if ((i1>0) && (i2>0))  {
          m1 = i1-1;
          m2 = i2-1;
        } else  {
          m1 = i1;
          m2 = i2;
        }
        if ((i1<nres1-1) && (i2<nres2-1))  {
          n1 = i1+1;
          n2 = i2+1;
        } else  {
          n1 = i1;
          n2 = i2;
        }
        if (m1!=n1)  {
          v1[0] = Calpha1[n1]->x - Calpha1[m1]->x;
          v1[1] = Calpha1[n1]->y - Calpha1[m1]->y;
          v1[2] = Calpha1[n1]->z - Calpha1[m1]->z;
          v2[0] = Calpha2[n2]->x - Calpha2[m2]->x;
          v2[1] = Calpha2[n2]->y - Calpha2[m2]->y;
          v2[2] = Calpha2[n2]->z - Calpha2[m2]->z;
          l1    = v1[0]*v1[0] + v1[1]*v1[1] + v1[2]*v1[2];
          l2    = v2[0]*v2[0] + v2[1]*v2[1] + v2[2]*v2[2];
          if ((l1>MachEps) && (l2>MachEps))  {
            cosine = (v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2])/sqrt(l1*l2);
            if (cosine>=minCosine)  {
              //  The contact is valid. Because the contacts are sorted
              // by decreasing the contact distance, we simply accept all
              // firstly encountered contacts and by this invalidate all
              // other contacts of the same atoms
              if (j<i)  contact[j].Copy ( contact[i] );
              // close contact
              a1[i1].c    = i2;
              a2[i2].c    = i1;
              a1[i1].dist = contact[j].dist;
              a2[i2].dist = contact[j].dist;
              ip[j]       = 1;
              im[j]       = 1;
              j++;
            }
          }
        }
      }
    }
    ncontacts = j;

    for (i=0;i<ncontacts-1;i++)  {
      for (j=0;j<i;j++)
        if ((ip[j]>=0) || (im[j]>0))
          ExpandContact ( contact[j],ip[j],im[j],contact[i].dist );
      ExpandContact ( contact[i],ip[i],im[i],contact[i+1].dist );
    }

    for (i=0;i<ncontacts;i++)
      if (((ip[i]>=0) || (im[i]>0)) && (contact[i].dist>=0.0))
        ExpandContact ( contact[i],ip[i],im[i],rmsd_est*rmsd_est );

    FreeVectorMemory ( ip,0 );
    FreeVectorMemory ( im,0 );

  }

  if (contact)  delete[] contact;

}


void  CSuperpose::RecoverGaps ( PPCAtom Ca1, PSSpAtom at1, int nat1,
                                PPCAtom Ca2, PSSpAtom at2, int nat2,
                                realtype thresh )  {
//   Checks if additional mappings may be made when moving
// from sides of gaps to their centers.
realtype thr2,d,d2;
int      i, k1,k2,n1,n2,sw;
Boolean  B1,B2;

  thr2 = thresh*thresh;
  i    = 0;
  while (i<nat1)  {

    // skip all closed contacts
    while (i<nat1)
      if (at1[i].c>=0)  i++;
                  else  break;

    if (i<nat1)  {

      k1 = i;   // begining of a gap in 1st structure
      if (i>0)  n1 = at1[i-1].c+1; // begining of the gap in 2nd structure
          else  n1 = -1;

      // skip all open contacts
      while (i<nat1)
        if (at1[i].c<0)  i++;
                   else  break;
      k2 = i-1; // end of the gap in 1st structure
      if (i<nat1)  n2 = at1[i].c-1; // end of the gap in 2nd structure
             else  n2 = -1;

      // try to cover the gap
      if ((n1<0) && (n2>=0))  {
        //  The gap is in the begining of 1st structure.
        //  Recover it from the end to the begining.
        while ((k2>=0) && (n2>=0))
          if ((at2[n2].c<0) && at2[n2].CompatibleSSE(at1[k2])) {
            d = Ca1[k2]->GetDist2 ( Ca2[n2] );
            if (d<=thr2)  {
              at1[k2].c    = n2;
              at2[n2].c    = k2;
              at1[k2].dist = d;
              at2[n2].dist = d;
              n2--;
              k2--;
            } else
              break;
          } else
            break;

      } else if ((n1>=0) && (n2<0))  {
        //  The gap is in the end of 1st structure.
        //  Recover it from begining to the end.
        while ((k1<nat1) && (n1<nat2))
          if (at2[n1].c<0 && at2[n1].CompatibleSSE(at1[k1]))  {
            d = Ca1[k1]->GetDist2 ( Ca2[n1] );
            if (d<=thr2)  {
              at1[k1].c    = n1;
              at2[n1].c    = k1;
              at1[k1].dist = d;
              at2[n1].dist = d;
              n1++;
              k1++;
            } else
              break;
          } else
            break;

      } else if ((n1>=0) && (n2>=0))  {
        //  The gap is surrounded by closed contacts in the 1st structure.
        //  Recover it gradually from begining and the end.
        B1 = True;
        B2 = True;
        while ((k1<=k2) && (n1<=n2) && (B1 || B2))  {
          if (B1)  {
            if ((at2[n1].c>=0) ||
                (!at2[n1].CompatibleSSE(at1[k1])))  B1 = False;
            else  {
              d = Ca1[k1]->GetDist2 ( Ca2[n1] );
              if (d>thr2)  B1 = False;
            }
          }
          if (B2)  {
            if ((at2[n2].c>=0) ||
                (!at2[n2].CompatibleSSE(at1[k2])))  B2 = False;
            else  {
              d2 = Ca1[k2]->GetDist2 ( Ca2[n2] );
              if (d2>thr2)  B2 = False;
            }
          }
          if (B1 && B2)  {
            if (d>=d2)  sw = 2;
                  else  sw = 1;
          } else if (B1)  {
            sw = 1;
          } else if (B2)  {
            sw = 2;
          } else
            sw = 0;
          if (sw==1)  {
            at1[k1].c    = n1;
            at2[n1].c    = k1;
            at1[k1].dist = d;
            at2[n1].dist = d;
            n1++;
            k1++;
          } else if (sw==2)  {
            at1[k2].c    = n2;
            at2[n2].c    = k2;
            at1[k2].dist = d2;
            at2[n2].dist = d2;
            n2--;
            k2--;
          }

        }

      }

    }

  }     

}



void  CSuperpose::CleanShortSections ( PSSpAtom at1, int nat1,
                                       PSSpAtom at2 )  {
//    Checks if continuous mapped sections of sequences c1 and c2
//  follow the same direction (along protein section) and are
//  long enough to be significant. If sections are too short
//  then they are unmapped.
int  i,j,j2,k,shortSect,nmisdr1;

  if (nmisdr<2)  shortSect = shortSect1;
           else  shortSect = shortSect2;
  nmisdr = 0;

  k = -1;
  for (i=0;i<nat1;i++)
    if (at1[i].c>=0)  {
      if (k<0)  k = i;  // begining of a continuous section
      else if (at1[i].c<=at1[i-1].c)  {
        // a misdirection has been found
        nmisdr++; 
        if (i-k<=shortSect)  {
          // the previous section is too short to be significant;
          // waste it:
          for (j=k;j<i;j++)  {
            j2 = at1[j].c;
            if ((at1[j ].unmap1!=UNMAP_NO) && 
                (at2[j2].unmap1!=UNMAP_NO))  {
              at2[j2].c = -1;
              at1[j ].c = -1;
            }
          }
        }
        k = i;  // mark begining of the new continuous section
      }
    } else if (k>=0)  {
      // end of the continuous section
      if (i-k<=shortSect)  {
        // the section is too short - dispose of it:
        for (j=k;j<i;j++)  {
          j2 = at1[j].c;
          if ((at1[j ].unmap1!=UNMAP_NO) && 
              (at2[j2].unmap1!=UNMAP_NO))  {
            at2[j2].c = -1;
            at1[j ].c = -1;
          }
        }
      }
      k = -1; // mark end of section, or begining of a gap
    }

  if (k>=0)  {
    // end of last continuous section
    if (nat1-k<=shortSect)  {
      // the section is too short - dispose of it:
      for (j=k;j<nat1;j++)  {
        j2 = at1[j].c;
        if ((at1[j ].unmap1!=UNMAP_NO) && 
            (at2[j2].unmap1!=UNMAP_NO))  {
          at2[j2].c = -1;
          at1[j ].c = -1;
        }
      }
    }
  }

}


void CSuperpose::CalcNGaps ( PSSpAtom a, int nres,
                             int & Ng, int & Nm )  {
int  i,k,m;

  Ng = 0;
  Nm = 0;
  m  = -1;
  k  = -1;
  for (i=0;i<nres;i++)
    if (a[i].c0>=0)  {
      if (k<0)  k = i;  // begining of a continuous section
      else if (a[i].c0<=a[i-1].c0)  {
        // a misdirection has been found - end of section
        Ng++;
        Nm++;
        k = i;  // mark begining of the new continuous section
      }
    } else if (k>=0)  {
      // end of the continuous section
      Ng++;
      if ((m>=0) && (a[k].c0<=m))  Nm++;
      m = a[k].c0;
      k = -1; // mark end of section, or begining of a gap
    }

  if (a[nres-1].c0<0)  Ng--;

}

realtype CSuperpose::CalcNCombs ( PCSSGraph G, PSSSEDesc SSED, int nSSEs,
                                  PSSpAtom  a, int nres )  {
ivector  F;
realtype nc;
int      i,j,k,n;
Boolean  matched;
//Boolean  keepIt;

  GetVectorMemory ( F,nSSEs,1 );

  //  find matched SSEs
  k = 0;

  for (i=0;i<nSSEs;i++)
    if (SSED[i].match>0)  {
      matched = False;
      for (j=SSED[i].pos;(j<=SSED[i].pend) && (!matched);j++)
        matched = (a[j].c0>=0);
      if (matched)
        F[++k] = i+1;
    }

  for (i=1;i<k;i++)
    for (j=i+1;j<=k;j++)
      if (F[j]<F[i])  {
        n    = F[i];
        F[i] = F[j];
        F[j] = n;
      }

  //  get number of combinations
  nc = RMax ( 1.0,G->CalcCombinations(F,k) );

  FreeVectorMemory ( F,1 );

  return RMax(1.0,nc);

}


//  -----------------------------------------------------------------

int CSortDist::Compare ( int i, int j )  {
//  sort by decreasing: rd[i+1]<=rd[i]

  if ((sd[i].unmap1<=sd[j].index) &&
      (sd[j].index<=sd[i].unmap2))  return -1;
  if ((sd[j].unmap1<=sd[i].index) &&
      (sd[i].index<=sd[j].unmap2))  return +1;

  if (sd[j].dist>sd[i].dist)        return +1;
  if (sd[j].dist<sd[i].dist)        return -1;

  return 0;

}

void CSortDist::Swap ( int i, int j )  {
realtype r;
int      k;
  r = sd[i].dist;   sd[i].dist   = sd[j].dist;   sd[j].dist   = r;
  k = sd[i].index;  sd[i].index  = sd[j].index;  sd[j].index  = k;
  k = sd[i].unmap1; sd[i].unmap1 = sd[j].unmap1; sd[j].unmap1 = k;
  k = sd[i].unmap2; sd[i].unmap2 = sd[j].unmap2; sd[j].unmap2 = k;
}


void CSortDist::Sort ( PSSortDistData sdata, int len )  {
  sd = sdata;
  CQuickSort::Sort ( sdata,len );
}

//  -----------------------------------------------------------------

void CSuperpose::GetSSESpseCenters ( RSSSEDesc Q1, RSSSEDesc Q2,
                                     RSSSEDesc T1, RSSSEDesc T2,
                                     realtype & qc1, realtype & qc2,
                                     realtype & tc1, realtype & tc2 )  {
realtype d2, dq,dt, quality,quality0;
int      iq1,pq1,eq1,lq1, it1,pt1,et1, l1;
int      iq2,pq2,eq2,lq2, it2,pt2,et2, l2;
int      i,j;

  l1  = IMax(hx_min_len,sd_min_len)/2;

  pq1 = IMin(Q1.pos+l1,Q1.pend);
  pq2 = IMin(Q2.pos+l1,Q2.pend);
  pt1 = IMin(T1.pos+l1,T1.pend);
  pt2 = IMin(T2.pos+l1,T2.pend);

  eq1 = IMax(pq1,Q1.pend-l1);
  eq2 = IMax(pq2,Q2.pend-l1);
  et1 = IMax(pt1,T1.pend-l1);
  et2 = IMax(pt2,T2.pend-l1);

  quality0 = 0.0;
  qc1      = realtype(Q1.pos+Q1.pend)/2.0;
  qc2      = realtype(Q2.pos+Q2.pend)/2.0;
  tc1      = realtype(T1.pos+T1.pend)/2.0;
  tc2      = realtype(T2.pos+T2.pend)/2.0;
  if ((Q1.len<=0) || (Q2.len<=0) || (T1.len<=0) || (T2.len<=0))
    return;

  for (iq1=pq1;iq1<=eq1;iq1++)  {
    lq1 = IMin(iq1-Q1.pos,Q1.pend-iq1);
    for (it1=pt1;it1<=et1;it1++)  {
      l1 = IMin ( lq1,IMin(it1-T1.pos,T1.pend-it1) );

      for (iq2=pq2;iq2<=eq2;iq2++)  {
        lq2 = IMin(iq2-Q2.pos,Q2.pend-iq2);
        for (it2=pt2;it2<=et2;it2++)  {
          l2 = IMin ( lq2,IMin(it2-T2.pos,T2.pend-it2) );

          d2 = 0.0;
          for (i=-l1;i<=l1;i++)
            for (j=-l2;j<=l2;j++)  {
              dq  = Calpha1[iq1+i]->GetDist2 ( Calpha1[iq2+j] );
              dt  = Calpha2[it1+i]->GetDist2 ( Calpha2[it2+j] );
              d2 += dq + dt - 2.0*sqrt(dq*dt);
            }

          dq      = (2*l1+1)*(2*l2+1);
          quality = sqrt(dq)/(1.0+d2/(dq*Rmsd0*Rmsd0));
          if (quality>quality0)  {
            quality0 = quality;
            qc1      = iq1;
            qc2      = iq2;
            tc1      = it1;
            tc2      = it2;
          }

        }
      }

    }
  }

}


int  CSuperpose::FirstGuess ( ivector F1, ivector F2, int mlen )  {
rvector  c1,c2;
realtype xc1,yc1,zc1, xc2,yc2,zc2, r1,r2;
vect3    vc1,vc2;
int      i,j, i1,i2, j1,j2, l, na;


  //   1. Mark all atoms as non-corresponding

  for (i=0;i<nres1;i++)  a1[i].c = -1;
  for (i=0;i<nres2;i++)  a2[i].c = -1;


  //  2. Correspond C-alphas of matched SSEs and calculate
  //     the mass centers

  GetVectorMemory ( c1,mlen,1 );
  GetVectorMemory ( c2,mlen,1 );
  if (mlen>1)  {
    for (i=1;i<=mlen;i++)  {
      c1[i] = 0.0;
      c2[i] = 0.0;
    }
    l = 0;
    for (i=1;i<mlen;i++)
      for (j=i+1;j<=mlen;j++)  {
        GetSSESpseCenters ( SSED1[F1[i]-1],SSED1[F1[j]-1],
                            SSED2[F2[i]-1],SSED2[F2[j]-1],
                            xc1,yc1, xc2,yc2 );
        if ((xc1>=0.0) && (yc1>=0.0) && (xc2>=0.0) && (yc2>=0.0))  {
          c1[i] += xc1;
          c1[j] += yc1;
          c2[i] += xc2;
          c2[j] += yc2;
        } else
          l++;
      }
    l = mlen - 1 - l;
    for (i=1;i<=mlen;i++)  {
      c1[i] /= l;
      c2[i] /= l;
    }
  } else  {
    i = F1[1] - 1;
    c1[1] = realtype(SSED1[i].pos+SSED1[i].pend)/2.0;
    i = F2[1] - 1;
    c2[1] = realtype(SSED2[i].pos+SSED2[i].pend)/2.0;
  }

  na  = 0;
  xc1 = 0.0;
  yc1 = 0.0;
  zc1 = 0.0;
  xc2 = 0.0;
  yc2 = 0.0;
  zc2 = 0.0;
  for (i=1;i<=mlen;i++)  {  
    i1 = F1[i] - 1;
    i2 = F2[i] - 1;
    SSED1[i1].m = F2[i];
    SSED2[i2].m = F1[i];
    if ((SSED1[i1].len>0) && (SSED2[i2].len>0))  {
      r1 = RMin   ( c1[i]-SSED1[i1].pos,SSED1[i1].pend-c1[i] );
      r2 = RMin   ( c2[i]-SSED2[i2].pos,SSED2[i2].pend-c2[i] );
      r1 = RMin   ( r1,r2    );
      j1 = mround ( c1[i]-r1 );
      j2 = mround ( c2[i]-r1 );
      l  = mround ( 2.0*r1   );
      for (j=0;j<=l;j++)  {
        a1[j1].c = j2;
        a2[j2].c = j1;
        xc1 += Calpha1[j1]->x;
        yc1 += Calpha1[j1]->y;
        zc1 += Calpha1[j1]->z;
        xc2 += Calpha2[j2]->x;
        yc2 += Calpha2[j2]->y;
        zc2 += Calpha2[j2]->z;
        j1++;
        j2++;
        na++;
      }
    }
  }

  FreeVectorMemory ( c1,1 );
  FreeVectorMemory ( c2,1 );

  if (na<=0)  return 1;

  xc1 /= na;
  yc1 /= na;
  zc1 /= na;
  xc2 /= na;
  yc2 /= na;
  zc2 /= na;
  
  //  3.  Calculate the correlation matrix

  for (i=1;i<=3;i++)
    for (j=1;j<=3;j++)
      A[i][j] = 0.0;

  for (i1=0;i1<nres1;i1++)  {
    i2 = a1[i1].c;
    if (i2>=0)  {
      vc1[0] = Calpha1[i1]->x - xc1;
      vc1[1] = Calpha1[i1]->y - yc1;
      vc1[2] = Calpha1[i1]->z - zc1;
      vc2[0] = Calpha2[i2]->x - xc2;
      vc2[1] = Calpha2[i2]->y - yc2;
      vc2[2] = Calpha2[i2]->z - zc2;
      for (i=1;i<=3;i++)
        for (j=1;j<=3;j++)
          A[i][j] += vc1[j-1]*vc2[i-1];
    }
  }


  //  4. Calculate the rotation matrix and add translation

  if (CalculateTMatrix())  return 2;

  TMatrix[0][3] = xc2 - TMatrix[0][0]*xc1 - 
                        TMatrix[0][1]*yc1 - TMatrix[0][2]*zc1;
  TMatrix[1][3] = yc2 - TMatrix[1][0]*xc1 - 
                        TMatrix[1][1]*yc1 - TMatrix[1][2]*zc1;
  TMatrix[2][3] = zc2 - TMatrix[2][0]*xc1 - 
                        TMatrix[2][1]*yc1 - TMatrix[2][2]*zc1;

  return 0;

}



void  CSuperpose::ChooseFirstRotation ( int rotSSE1, int rotSSE2 )  {
//  In case when only one SSE is matched, the initial rotation
// matrix is defined only up to rotation about that SSE.
// Given that matched SSE from 1st structure, this procedure
// tries to choose a more appropriate rotation such that other
// SSEs are most closely approached by each other.
mat44     m,tm,mm;
PSContact contact;
realtype  alpha, vx,vy,vz, x0,y0,z0, B, score,score0;
int       ia1,ia2,nrot,i,j,k,l,ncontacts,na,na0, i1,i2;

  ia1       = rotSSE1 - 1;
  ia2       = rotSSE2 - 1;
  ncontacts = 0;
  for (j=0;j<nSSEs1;j++)
    if (j!=ia1)
      for (k=0;k<nSSEs2;k++)
        if ((k!=ia2) && (SSED1[j].type==SSED2[k].type))
          ncontacts++;

  if (ncontacts>0)  {

    contact = new SContact[nSSEs1*nSSEs2];

    nrot = 36;  // number of rotations to try

    x0 = SSED1[ia1].xs1;
    y0 = SSED1[ia1].ys1;
    z0 = SSED1[ia1].zs1;
    vx = SSED1[ia1].xs2 - x0;
    vy = SSED1[ia1].ys2 - y0;
    vz = SSED1[ia1].zs2 - z0;

    na0    = -1;
    score0 = MaxReal;

    for (i=0;i<nrot;i++)  {

      // add rotation to the transformation matrix
      alpha = i*2.0*Pi/nrot;
      GetVecTMatrix ( m,alpha,vx,vy,vz,x0,y0,z0 );
      for (j=0;j<4;j++)
        for (k=0;k<4;k++)  {
          B = 0.0;
          for (l=0;l<4;l++)
            B += m[j][l]*TMatrix[l][k];
          tm[j][k] = B;
        }

      // find contacts between SSEs
      ncontacts = 0;
      for (j=0;j<nSSEs1;j++)
        if (j!=ia1)  {
          SSED1[j].Transform ( tm );
          for (k=0;k<nSSEs2;k++)
            if ((k!=ia2) && (SSED1[j].type==SSED2[k].type) &&
                (SSED1[j].Cosine(SSED2[k])>=minCosine))  {
              SSED1[j].CalcScore ( SSED2[k] );
              if (SSED1[j].score<=maxContact/4.0)  {
                contact[ncontacts].id1  = j;
                contact[ncontacts].id2  = k;
                contact[ncontacts].dist = SSED1[j].score;
                ncontacts++;
              }
            }
        }

      // count potential atom contacts in mapped SSEs

      for (j=0;j<nSSEs1;j++)  SSED1[j].m = -1;
      for (j=0;j<nSSEs2;j++)  SSED2[j].m = -1;
      SSED1[ia1].m = ia2;
      SSED2[ia2].m = ia1;

      SortContacts ( contact,ncontacts,CNSORT_DINC );
      na    = 0;
      score = 0.0;
      for (j=0;j<ncontacts;j++)  {
        i1 = contact[j].id1;
        i2 = contact[j].id2;
        if ((SSED1[i1].m<0) && (SSED2[i2].m<0))  {
          l = 0;
          if (!allowMC)  {
            // check for misfolding
            k = i1 + 1;
            while (k<nSSEs1)
              if (SSED1[k].m>=0)  break;
                            else  k++;
            if (k<nSSEs1) {
              if (i2>=SSED1[k].m)  l = 1;
            }
            k = i1 - 1;
            while (k>=0)
              if (SSED1[k].m>=0)  break;
                            else  k--;
            if (k>=0) {
              if (i2<=SSED1[k].m)  l = 1;
            }
          }
          if (!l)  {
            // count contact
            na += IMin(SSED1[i1].len,SSED2[i2].len);
            // bookkeep the mapping; this invalidate other contacts
            // of mapped SSEs
            SSED1[i1].m = i2;
            SSED2[i2].m = i1;
            score += contact[j].dist;
          }
        }
      }

      // keep rotation with maximal number of potential mappings
      if ((na>na0) || ((na==na0) && (score<score0)))  {
        na0    = na;
        score0 = score;
        for (j=0;j<4;j++)
          for (k=0;k<4;k++)
            mm[j][k] = tm[j][k];
      }

    }

    delete[] contact;

    if (na0>0)
      for (j=0;j<4;j++)
        for (k=0;k<4;k++)
          TMatrix[j][k] = mm[j][k];

  }

}


realtype  CSuperpose::MatchQuality ( int Nalign, realtype Rmsd )  {
  if (Nalign==0)  return 0.0;
  return MatchQuality2 ( Nalign,Rmsd*Rmsd*Nalign );
}

realtype  CSuperpose::MatchQuality2 ( int Nalign, realtype dist2 )  {
realtype  NormN,Na2,NormR;
  NormN = nres1*nres2;
  if (NormN<=0.0) return 0.0;
  Na2   = Nalign*Nalign;
  NormR = dist2/(Nalign*Rmsd0*Rmsd0);
  return  Na2/((1.0+NormR)*NormN);
}


void CSuperpose::UnmapExcluded ( PSSpAtom a1, PSSpAtom a2, int nres1 )  {
int i;
  for (i=0;i<nres1;i++)
    if (a1[i].excluded && (a1[i].c>=0))  {
      a2[a1[i].c].c = -1;
      a1[i].c       = -1;
    }
}

int  CSuperpose::OptimizeNalign()  {
//  Finds maximal Nalign such that RMSD does not exceed the given Rmsd
SSectionDist D;
vect3        vc1,vc2;
realtype     xc1,yc1,zc1, xc2,yc2,zc2, B;
realtype     dist2,Q,Q1,maxRMSD2, contDist;
int          na,nl;
int          i,j,i1,i2,iter,nobetter_cnt,rc;
Boolean      Done;

  //  Make iterative atom-to-atom superposition

  Q_achieved   = -1.0;
  iter         = 0;
  nobetter_cnt = 0;
  rc           = SPOSE_Ok;
  maxRMSD2     = maxRMSD*maxRMSD;

  do  {

    B = IMax(iter,iterMin);
    B = iter/B;
    contDist = minContact + (maxContact-minContact)*B;

    //   1. Find corresponding atoms

    //   1.1 Transform 1st structure to the current superposition
    for (i=0;i<nres1;i++)
      Calpha1[i]->Transform ( TMatrix );

    for (i=0;i<nSSEs1;i++)
      SSED1[i].Transform ( TMatrix );

    //   1.2 Mark all atoms as non-corresponding
    for (i=0;i<nres1;i++)  {
      a1[i].c      = -1;
      a1[i].unmap1 = UNMAP_YES;
      a1[i].unmap2 = UNMAP_YES;
    }
    for (i=0;i<nres2;i++)  {
      a2[i].c      = -1;
      a2[i].unmap1 = UNMAP_YES;
      a2[i].unmap2 = UNMAP_YES;
    }
    for (i=0;i<nSSEs1;i++)  SSED1[i].m = -1;
    for (i=0;i<nSSEs2;i++)  SSED2[i].m = -1;

    //   1.3 Correspond atoms of matched SSEs first
    for (i=1;i<=FFlen;i++)  {
      CalcDistance ( FF1[i],FF2[i],D );
      AlignSSEs    ( D,UNMAP_NO );
    }

    //   1.4 Try to correspond other SSEs
    CorrespondSSEs ( FH1,nFH1,FH2,nFH2,contDist );
    CorrespondSSEs ( FS1,nFS1,FS2,nFS2,contDist );

    //   1.5 Correspond all other atoms

    CorrespondContacts ( MMDB1,contDist );

    RecoverGaps ( Calpha1,a1,nres1,Calpha2,a2,nres2,2.0*contDist );
    RecoverGaps ( Calpha2,a2,nres2,Calpha1,a1,nres1,2.0*contDist );

    if (selInclHnd1>0)  UnmapExcluded ( a1,a2,nres1 );
    if (selInclHnd2>0)  UnmapExcluded ( a2,a1,nres2 );

    //   1.6  Find atoms, which may be unmapped for optimizing
    //        the quality function
    dist2 = 0.0;  // square distance between the structures at
                  // current rotation
    nl    = 0;    // number of atoms that may be unmapped
    na    = 0;    // total number of corresponding atoms
    for (i1=0;i1<nres1;i1++)  {
      i2 = a1[i1].c;
      if (i2>=0)  {
        na++;
        dist2 += a1[i1].dist;
        if ((a1[i1].unmap1!=UNMAP_NO) && (a2[i2].unmap1!=UNMAP_NO))  {
          sdata[nl].dist   = a1[i1].dist;
          sdata[nl].index  = i1;
          sdata[nl].unmap1 = a1[i1].unmap1;
          sdata[nl].unmap2 = a1[i1].unmap2;
          nl++;
        }
      }
    }

    //   1.7  Unmap atoms for optimizing the quality function
    if ((nl>0) && (na>3))  {
      SortDist.Sort ( sdata,nl );
      i = 0;
      if (dist2<=na*maxRMSD2)  {
        Q1 = MatchQuality2 ( na,dist2 );
        j  = 0;
      } else  {
        Q1 = -1.0;
        j  = nl;
      }
      while ((i<nl) && (na>3))  {
        dist2 -= sdata[i].dist;
        na--;
        i++;
        if (dist2<=na*maxRMSD2)  {  // rmsd must be within the limits
          Q = MatchQuality2 ( na,dist2 );
          if (Q>Q1)  {
            Q1 = Q;
            j  = i;
          }
        }
      }
      for (i=0;i<j;i++)  {
        i1 = sdata[i].index;
        i2 = a1[i1].c;
        a1[i1].c = -1;
        a2[i2].c = -1;
      }
    }

    //   1.8 Clean up short sections
    CleanShortSections ( a1,nres1,a2 );
    CleanShortSections ( a2,nres2,a1 );


    //   2. Make rotation with the new correspondence

    //   2.1  Calculate centers of mass and rmsd
    xc1   = 0.0;  // mass
    yc1   = 0.0;  //   center of
    zc1   = 0.0;  //     1st structure
    xc2   = 0.0;  // mass
    yc2   = 0.0;  //   center of
    zc2   = 0.0;  //     1st structure
    na    = 0;    // total number of corresponding atoms
    dist2 = 0.0;  // square distance between the structures
                  // at current rotation
    for (i1=0;i1<nres1;i1++)  {
      i2 = a1[i1].c;
      if (i2>=0)  {
        xc1   += cax0[i1];
        yc1   += cay0[i1];
        zc1   += caz0[i1];
        xc2   += Calpha2[i2]->x;
        yc2   += Calpha2[i2]->y;
        zc2   += Calpha2[i2]->z;
        dist2 += a1[i1].dist;
        na++;
      }
    }

    //   2.2 Reset rotating coordinates for the next iteration
    for (i=0;i<nres1;i++)  {
      Calpha1[i]->x = cax0[i];
      Calpha1[i]->y = cay0[i];
      Calpha1[i]->z = caz0[i];
    }

    Q = MatchQuality2 ( na,dist2 );

    nobetter_cnt++;
    if (Q>Q_achieved)  {
      //  2.3  Retain the current approximation
      if (Q-Q_achieved>minQStep)  nobetter_cnt = 0;
      Q_achieved = Q;
      for (i=0;i<4;i++)
        for (j=0;j<4;j++)
          TMx[i][j] = TMatrix[i][j];
      for (i=0;i<nres1;i++)  {
        a1[i].c0    = a1[i].c;
        a1[i].dist0 = a1[i].dist;
      }
      for (i=0;i<nres2;i++)  {
        a2[i].c0    = a2[i].c;
        a2[i].dist0 = a2[i].dist;
      }
      for (i=0;i<nSSEs1;i++)  SSED1[i].match = SSED1[i].m;
      for (i=0;i<nSSEs2;i++)  SSED2[i].match = SSED2[i].m;
      if (na>0)  rmsd_achieved = sqrt(dist2/na);
           else  rmsd_achieved = 0.0;
      nalgn = na;
    }

    Done = (na<=0) || (iter>iterMax) || 
           ((iter>iterMin) && (nobetter_cnt>maxHollowIt));

    if (!Done)  {

      //  2.4  Calculate the correlation matrix for the next iteration
      xc1 /= na;
      yc1 /= na;
      zc1 /= na;
      xc2 /= na;
      yc2 /= na;
      zc2 /= na;
  
      for (i=1;i<=3;i++)
        for (j=1;j<=3;j++)
          A[i][j] = 0.0;

      for (i1=0;i1<nres1;i1++)  {
        i2 = a1[i1].c;
        if (i2>=0)  {
          vc1[0] = Calpha1[i1]->x - xc1;
          vc1[1] = Calpha1[i1]->y - yc1;
          vc1[2] = Calpha1[i1]->z - zc1;
          vc2[0] = Calpha2[i2]->x - xc2;
          vc2[1] = Calpha2[i2]->y - yc2;
          vc2[2] = Calpha2[i2]->z - zc2;
          B = 1.0;
          for (i=1;i<=3;i++)
            for (j=1;j<=3;j++)
              A[i][j] += B*vc1[j-1]*vc2[i-1];
        }
      }

      if (CalculateTMatrix())  rc = SPOSE_SVDFail;
      else  {

        //  5.3.e add translation
        TMatrix[0][3] = xc2 - TMatrix[0][0]*xc1 - 
                        TMatrix[0][1]*yc1 - TMatrix[0][2]*zc1;
        TMatrix[1][3] = yc2 - TMatrix[1][0]*xc1 - 
                        TMatrix[1][1]*yc1 - TMatrix[1][2]*zc1;
        TMatrix[2][3] = zc2 - TMatrix[2][0]*xc1 - 
                        TMatrix[2][1]*yc1 - TMatrix[2][2]*zc1;

      }

    }

    iter++;

  } while ((rc==SPOSE_Ok) && (!Done));

  if (na<=0)  rc = SPOSE_RemoteStruct;
  else
    for (i=0;i<4;i++)
      for (j=0;j<4;j++)
        TMatrix[i][j] = TMx[i][j];

  return  rc;

}


void  CSuperpose::CalcQScore ( RSSSEDesc SSE1 )  {
//  Calculates Q-score of overlaping SSE1 with matched SSE
realtype  NormN,dist2;
int       p1,p2,na,i;

  SSE1.Qscore = 0.0;
  SSE1.Rscore = 0.0;
  SSE1.Xscore = 0.0;
  if (SSE1.match<=0)  return;

  SSED2[SSE1.match-1].Qscore = 0.0;
  SSED2[SSE1.match-1].Rscore = 0.0;
  SSED2[SSE1.match-1].Xscore = 0.0;
  NormN = SSE1.len*SSED2[SSE1.match-1].len;
  if (NormN<=0.0)  return;

  p1 = SSED2[SSE1.match-1].pos;
  p2 = SSED2[SSE1.match-1].pend;
  if ((SSE1.pos>=0) && (SSE1.pend>=SSE1.pos) &&
      (p1>=0) && (p2>=p1))  {
    na    = 0;
    dist2 = 0.0;
    for (i=SSE1.pos;i<=IMin(nres1-1,SSE1.pend);i++)
      if ((p1<=a1[i].c0) && (a1[i].c0<=p2))  {
        dist2 += a1[i].dist0;
        na++;
      }
    if (na>0)  {
      dist2 /= na*Rmsd0*Rmsd0;
      SSE1.Rscore = 1.0/(1.0+dist2);
      SSE1.Xscore = Exp ( -dist2 );
      SSE1.Qscore = na*na/((1.0+dist2)*NormN);
    } else  {
      SSE1.Rscore = 0.0;
      SSE1.Xscore = 0.0;
      SSE1.Qscore = 0.0;
    }
  }

  SSED2[SSE1.match-1].Qscore = SSE1.Qscore;
  SSED2[SSE1.match-1].Rscore = SSE1.Rscore;
  SSED2[SSE1.match-1].Xscore = SSE1.Xscore;

}


int  CSuperpose::SuperposeCalphas (
            PCSSGraph     G1,   //  SSE graph of 1st structure
            PCSSGraph     G2,   //  SSE graph of 2nd structure
            ivector       F1,   //  matched vertices of G1 [1..mlen]
            ivector       F2,   //  matched vertices of G2 [1..mlen]
            int         mlen,   //  length of match (F1,F2)
            PCMMDBManager M1,   //  1st structure
            PCMMDBManager M2,   //  2nd structure
            int  selHndIncl1,   //  sel handle to include atoms from M1
            int  selHndIncl2    //  sel handle to include atoms from M2
                                  )  {
int  i,j, rc;
int  selHnd1,selHnd2;

  driverID = 1;

  rc = 0;   // termination on errors

  rmsd_achieved = 0.0;
  nres1 = 0;
  nres2 = 0;
  nalgn = 0;
  ngaps = 0;
  for (i=0;i<4;i++)  {
    for (j=0;j<4;j++)
      TMatrix[i][j] = 0.0;
    TMatrix[i][i] = 1.0;
  }

  FreeMemory();

  if ((!G1) || (!G2) || 
      (!F1) || (!F2) || (mlen<=0) ||
      (!M1) || (!M2))  return SPOSE_BadData;

  FF1   = F1;
  FF2   = F2;
  FFlen = mlen;
  MMDB1 = M1;
  MMDB2 = M2;

  //  1. Select Calphas from both structures

  selInclHnd1 = selHndIncl1;
  selInclHnd2 = selHndIncl2;

  //  SelectCalphas obtains Calpha1,2 from MMDB manager and
  //  allocates a1,2
  selHnd1 = 0;
  selHnd2 = 0;
  SelectCalphas ( MMDB1,G1,Calpha1,a1,nres1,selHnd1,selInclHnd1,selString1 );
  SelectCalphas ( MMDB2,G2,Calpha2,a2,nres2,selHnd2,selInclHnd2,selString2 );
  if ((nres1<=0) || (nres2<=0))  {
    if (nres1<=0)  rc = SPOSE_NoCalphas1;
             else  rc = SPOSE_NoCalphas2;
    nres1 = 0;
    nres2 = 0;
    if (a1)  delete[] a1;
    if (a2)  delete[] a2;
    a1 = NULL;
    a2 = NULL;
    MMDB1->DeleteSelection ( selHnd1 );
    MMDB2->DeleteSelection ( selHnd2 );
    return rc;
  }


  //  2. Map vertices on the selected Calphas

  MapSSEs ( Calpha1,a1,nres1,G1,SSED1,nSSEs1 );
  MapSSEs ( Calpha2,a2,nres2,G2,SSED2,nSSEs2 );


  //  3. Common part for different Superpose drivers

  _superpose ( G1,G2,rc );

  //  4. Deselect C-alphas

  MMDB1->DeleteSelection ( selHnd1 );
  MMDB2->DeleteSelection ( selHnd2 );

  return rc;

}


//  -----------------------  SSuperposeData  -----------------------

void SSuperposeData::Init()  {
  G          = NULL;
  M          = NULL;
  a          = NULL;
  Calpha     = NULL;
  SSED       = NULL;
  selstring  = NULL;
  selHnd     = 0;
  selHndIncl = 0;
  nres       = 0;
  nSSEs      = 0;
}

void SSuperposeData::Dispose()  {
//   This DOES NOT dispose the graph and MMDB instance, however
//  selected C-alphas are deselected

  if (a)         delete[] a;
  if (SSED)      delete[] SSED;
  if (selstring) delete[] selstring;

  a         = NULL;
  nres      = 0;
  SSED      = NULL;
  selstring = NULL;
  nSSEs     = 0;

  DeselectCalphas();

}

void  SSuperposeData::DeselectCalphas()  {
  if (M && (selHnd>0))  M->DeleteSelection ( selHnd );
  selHnd = 0;
}

void  SSuperposeData::SelectCalphas()  {
  if (G && M && (selHnd<=0))  {
    G->SelectCalphas ( M,selHnd,selstring );
    M->GetSelIndex   ( selHnd,Calpha,nres );
  }
}

//  ----------------------------------------------------------------

int  CSuperpose::SuperposeCalphas (
            PSSuperposeData SD1,  // superposition data of 1st structure
            PSSuperposeData SD2,  // superposition data of 2nd structure
            ivector          F1,  // matched vertices of SD1.G [1..mlen]
            ivector          F2,  // matched vertices of SD2.G [1..mlen]
            int            mlen   // length of match (F1,F2)
                                  )  {
int  i,j, rc;

  driverID = 2;

  rc = 0;   // termination on errors

  rmsd_achieved = 0.0;
  nres1 = 0;
  nres2 = 0;
  nalgn = 0;
  ngaps = 0;
  for (i=0;i<4;i++)  {
    for (j=0;j<4;j++)
      TMatrix[i][j] = 0.0;
    TMatrix[i][i] = 1.0;
  }

  FreeMemory();

  if ((!SD1->G) || (!SD2->G) || 
      (!SD1->M) || (!SD2->M) ||
      (!F1) || (!F2) || (mlen<=0))
    return SPOSE_BadData;

  FF1   = F1;
  FF2   = F2;
  FFlen = mlen;
  MMDB1 = SD1->M;
  MMDB2 = SD2->M;

  //  1. Select Calphas from both structures

  selInclHnd1 = SD1->selHndIncl;
  selInclHnd2 = SD2->selHndIncl;

  //  SelectCalphas obtains Calpha1,2 from MMDB manager and
  //  allocates a1,2
  SelectCalphas ( MMDB1,SD1->G,SD1->Calpha,SD1->a,SD1->nres,
                  SD1->selHnd,SD1->selHndIncl,SD1->selstring );
  SelectCalphas ( MMDB2,SD2->G,SD2->Calpha,SD2->a,SD2->nres,
                  SD2->selHnd,SD2->selHndIncl,SD2->selstring );

  if ((SD1->nres<=0) || (SD2->nres<=0))  {
    if (SD1->nres<=0)  rc = SPOSE_NoCalphas1;
                 else  rc = SPOSE_NoCalphas2;
    SD1->Dispose();
    SD2->Dispose();
    return rc;
  }

  Calpha1 = SD1->Calpha;
  Calpha2 = SD2->Calpha;
  a1      = SD1->a;
  a2      = SD2->a;
  nres1   = SD1->nres;
  nres2   = SD2->nres;

  //  2. Map vertices on the selected Calphas

  MapSSEs ( Calpha1,a1,nres1,SD1->G,SD1->SSED,SD1->nSSEs );
  MapSSEs ( Calpha2,a2,nres2,SD2->G,SD2->SSED,SD2->nSSEs );

  SSED1  = SD1->SSED;
  SSED2  = SD2->SSED;
  nSSEs1 = SD1->nSSEs;
  nSSEs2 = SD2->nSSEs;

  //  3. Common part for different Superpose drivers

  _superpose ( SD1->G,SD2->G,rc );


  //  4. Prevent external data from being lost
  //     NOTE that "CSuperpose::GetSuperposition()" and 
  //     "CSuperpose::GetSSEDescX();" do not work with this driver.
  //     The superposition data are to be read directly from
  //     returned SD's

  a1      = NULL;
  a2      = NULL;
  SSED1   = NULL;
  SSED2   = NULL;
  Calpha1 = NULL;
  Calpha2 = NULL;
  nres1   = 0;
  nres2   = 0;

  return rc;

}


void  CSuperpose::_superpose ( PCSSGraph G1, PCSSGraph G2, int & rc )  {
mat44 TMx0;
int   i,j,i1,i2,AD_alloc;

  IdentifyUnmatchedSSEs ( FH1,nFH1,FS1,nFS1,FF1,FFlen,G1 );
  IdentifyUnmatchedSSEs ( FH2,nFH2,FS2,nFS2,FF2,FFlen,G2 );

  //  3. Allocate memory for corresponding atoms and shortest contacts

  sdata = new SSortDistData[nres1];

  GetVectorMemory ( cax0,nres1,0 );
  GetVectorMemory ( cay0,nres1,0 );
  GetVectorMemory ( caz0,nres1,0 );
  for (i=0;i<nres1;i++)  {
    cax0[i] = Calpha1[i]->x;
    cay0[i] = Calpha1[i]->y;
    caz0[i] = Calpha1[i]->z;
  }

  AD_alloc = 0;
  for (i=0;i<nSSEs1;i++)
    if (SSED1[i].len>AD_alloc)  AD_alloc = SSED1[i].len;
  for (i=0;i<nSSEs2;i++)
    if (SSED2[i].len>AD_alloc)  AD_alloc = SSED2[i].len;

  // matrix AD is used as a temporary storage at calculating
  // an optimal superposition of SSE pairs
  GetMatrixMemory ( AD,AD_alloc,AD_alloc,0,0 );

  SDistAlloc = IMax ( nFH1,nFS1 );
  j          = IMax ( nFH2,nFS2 );
  if ((SDistAlloc>0) && (j>0))  {
    SDist = new PSSectionDist[SDistAlloc];
    for (i=0;i<SDistAlloc;i++)
      SDist[i] = new SSectionDist[j];
  }


  //  4. Superpose secondary structures; TMx will be the initial guess

  if (FFlen==1)  {
    FirstGuess ( FF1,FF2,FFlen );
    ChooseFirstRotation ( FF1[1],FF2[1] );
  } else
    SuperposeSSGraphs ( G1,FF1,G2,FF2,FFlen );
  for (i=0;i<4;i++)
    for (j=0;j<4;j++)  {
      TMx0[i][j] = TMatrix[i][j];
      TMx [i][j] = TMatrix[i][j];
    }


  //  5. Make iterative atom-to-atom superposition

  MMDB1->MakeBricks ( Calpha2,nres2,1.25*maxContact );
  rc    = OptimizeNalign();


  //  6. Finalize the things

  if (nalgn<=0)  {
    for (i=0;i<4;i++)
      for (j=0;j<4;j++)
        TMatrix[i][j] = TMx0[i][j];
    for (i=0;i<nres1;i++)  a1[i].c0 = -1;
    for (i=0;i<nres2;i++)  a2[i].c0 = -1;
    rmsd_achieved = -1.0;
    nalgn    = 0;
    ngaps    = 0;
    seqIdent = 0.0;
    ncombs   = 1.0;
  } else  {
    CalcNGaps ( a1,nres1,i1,i );
    CalcNGaps ( a2,nres2,i2,j );
    ngaps    = IMax ( i1,i2 );
    nmd      = IMax ( i ,j  );
    seqIdent = 0.0;
    for (i=0;i<nres1;i++)
      if (a1[i].c0>=0)  {
        if (!strcasecmp(Calpha1[i]->GetResName(),
                        Calpha2[a1[i].c0]->GetResName()))
          seqIdent += 1.0;
      }
    seqIdent = seqIdent/nalgn;
    ncombs   = CalcNCombs ( G1,SSED1,nSSEs1,a1,nres1 ) *
               CalcNCombs ( G2,SSED2,nSSEs2,a2,nres2 );
    // get scores of matched SSEs:
    for (i=0;i<nSSEs1;i++)
      if (SSED1[i].match>0)  {
        SSED1[i].Transform ( TMatrix );
        SSED1[i].CalcScore ( SSED2[SSED1[i].match-1] );
        CalcQScore ( SSED1[i] );
      }
  }


  //  6.1 Release memory

  if (SDist)  {
    for (i=0;i<SDistAlloc;i++)
      if (SDist[i])  delete SDist[i];
    delete[] SDist;
    SDist = NULL;
  }
  SDistAlloc = 0;

  FreeVectorMemory ( FH1,1 );
  FreeVectorMemory ( FS1,1 );
  FreeVectorMemory ( FH2,1 );
  FreeVectorMemory ( FS2,1 );
  nFH1 = 0;
  nFS1 = 0;
  nFH2 = 0;
  nFS2 = 0;

  FreeMatrixMemory ( AD,AD_alloc,0,0 );

  FreeVectorMemory ( cax0,0 );
  FreeVectorMemory ( cay0,0 );
  FreeVectorMemory ( caz0,0 );

  if (sdata)  delete[] sdata;

}

