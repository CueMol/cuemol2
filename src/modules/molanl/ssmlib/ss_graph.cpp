// $Id: ss_graph.cpp,v 1.1 2010/01/23 14:25:05 rishitani Exp $
// =================================================================
//
//    29.04.04   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// -----------------------------------------------------------------
//
//  **** Module  :  ss_graph  <implementation>
//       ~~~~~~~~~
//  **** Classes :  CSSGraph  ( secondary structure graph )
//       ~~~~~~~~~  
//
//  (C) E. Krissinel 2002-2004
//
// =================================================================
//


#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __LinAlg__
//#include "linalg_.h"
#include <modules/molanl/mmdb/linalg_.h>
#endif

#ifndef  __SS_Graph__
#include "ss_graph.h"
#endif

//extern int strcasecmp(const char *p1, const char *p2);

//  ==========================  CSSGraph  ===========================

CSSGraph::CSSGraph() : CStream()  {
  InitSSGraph();
}

CSSGraph::CSSGraph ( RPCStream Object ) : CStream(Object)  {
  InitSSGraph();
}

CSSGraph::~CSSGraph() {
  FreeMemory();
}

void  CSSGraph::InitSSGraph()  {

  name = NULL;
  CreateCopy ( name,"" );

  Vertex    = NULL;
  Edge      = NULL;
  graph     = NULL;
  nVertices = 0;
  nEdges    = 0;
  nVAlloc   = 0;
  nEAlloc   = 0;
  nGAlloc   = 0;

  nHelices  = 0;
  nStrands  = 0;

  strcpy ( devChain," "  );
  devChain[0] = char(1);

}

void  CSSGraph::FreeMemory()  {
int i;

  if (name)  {
    delete[] name;
    name = NULL;
  }

  if (Vertex)  {
    for (i=0;i<nVAlloc;i++)
      if (Vertex[i])  delete Vertex[i];
    delete[] Vertex;
    Vertex = NULL;
  }
  nVertices = 0;
  nVAlloc   = 0;

  ReleaseEdges();

}

void  CSSGraph::SetGraphName ( pstr gname )  {
  CreateCopy ( name,gname );
}


int  SelectDomain ( PCMMDBManager MMDB, int & selHnd, pstr select,
                    int selType )  {
// select is of the following format:
//    "*", "(all)"            - take all file
//    "-"                     - take chain without chain ID
//    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
//                              insertion code i to residue number M
//                              insertion code j plus chain b
//                              residue number K insertion code p to
//                              residue number L insertion code q and
//                              so on.
//    "a:,b:..."              - take whole chains a and b and so on
//    "a:,b:Kp-Lq,..."        - any combination of the above.
int rc;

  selHnd = MMDB->NewSelection();
  rc = MMDB->SelectDomain ( selHnd,select,selType,SKEY_NEW,1 );
  if ((!rc) && (selType==STYPE_ATOM))  {
    // only C-alphas are needed
    MMDB->Select ( selHnd,selType,1,"*",ANY_RES,"*",ANY_RES,"*",
                         "*","[ CA ]","*","*",SKEY_AND );
  }

  return rc;

}


int CutOutDomain ( PCMMDBManager MMDB, pstr select )  {
// select is of the following format:
//    "*", "(all)"            - take all file
//    "-"                     - chain without chain ID
//    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
//                              insertion code i to residue number M
//                              insertion code j plus chain b
//                              residue number K insertion code p to
//                              residue number L insertion code q and
//                              so on.
//    "a:,b:..."              - take whole chains a and b and so on
//    "a:,b:Kp-Lq,..."        - any combination of the above.
int selHnd,rc;

  if (!select)   return 0;
  if ((!select[0]) || (select[0]=='*'))  return 0;
  else if (!strcasecmp(select,"(all)"))  return 0;

  rc = SelectDomain ( MMDB,selHnd,select,STYPE_RESIDUE );

  if (!rc)  {
    MMDB->Select ( selHnd,STYPE_RESIDUE,0,"*",
                   ANY_RES,"*",ANY_RES,"*",
                   "*","*","*","*",SKEY_XOR );
    MMDB->DeleteSelObjects ( selHnd );
    MMDB->FinishStructEdit ();
    MMDB->DeleteSelection  ( selHnd );
  }

  return rc;

}


void  CSSGraph::SelectCalphas ( PCMMDBManager MMDB, int & selHnd,
                                pstr selstring )  {
PChainID chain;
PPCAtom  A;
ChainID  chID;
ResName  rName;
InsCode  iCode;
AltLoc   aLoc;
pstr     S;
int      i,j,k,nchains,natoms,seqNum;
Boolean  B;

  if (selstring)  {

    S = NULL;
    CreateCopy ( S,selstring );

  } else  {

    chain  = NULL;
    GetAllChains ( chain,nchains );

    i = (sizeof(ChainID)+4)*nchains + 5;
    S = new char[i];
    S[0] = char(0);
    for (i=0;i<nchains;i++)  {
      if (i>0)               strcat ( S,"," );
      if (chain[i][0]!=' ')  strcat ( S,chain[i] );
    }
    if (chain)  delete[] chain;

  }

  selHnd = MMDB->NewSelection();
  MMDB->Select ( selHnd,STYPE_ATOM,1,S,ANY_RES,"*",ANY_RES,"*",
                            "*","[ CA ]","*","*",SKEY_NEW );

  // deselect extra altlocs, if any found
  MMDB->GetSelIndex ( selHnd,A,natoms );

  i = 0;
  k = 0;
  while (i<natoms)  {
    if (A[i])  {
      seqNum = A[i]->GetSeqNum();
      strcpy ( chID ,A[i]->GetChainID() );
      strcpy ( rName,A[i]->GetResName() );
      strcpy ( iCode,A[i]->GetInsCode() );
      strcpy ( aLoc ,A[i]->altLoc       );
      B = True;
      j = i;
      i++;
      while ((i<natoms) && B)
        if (A[i])  {
          if ((A[i]->GetSeqNum()==seqNum)         &&
              (!strcmp(A[i]->GetInsCode(),iCode)) &&
              (!strcmp(A[i]->GetResName(),rName)) &&
              (!strcmp(A[i]->GetChainID(),chID )))  {
            if (A[i]->occupancy<A[j]->occupancy)  {
              MMDB->SelectAtom ( selHnd,A[i],SKEY_CLR,False );
              k++;
            } else if (A[i]->occupancy>A[j]->occupancy)  {
              strcpy ( aLoc,A[i]->altLoc );
              MMDB->SelectAtom ( selHnd,A[j],SKEY_CLR,False );
              k++;
              j = i;
            } else if (!aLoc[0])  {
              MMDB->SelectAtom ( selHnd,A[i],SKEY_CLR,False );
              k++;
            } else if (!A[i]->altLoc[0])  {
              strcpy ( aLoc,A[i]->altLoc );
              MMDB->SelectAtom ( selHnd,A[j],SKEY_CLR,False );
              k++;
              j = i;
            } else if (strcmp(aLoc,A[i]->altLoc)<=0)  {
              MMDB->SelectAtom ( selHnd,A[i],SKEY_CLR,False );
              k++;
            } else  {
              strcpy ( aLoc,A[i]->altLoc );
              MMDB->SelectAtom ( selHnd,A[j],SKEY_CLR,False );
              k++;
              j = i;
            }
            i++;
          } else
            B = False;
        } else
          i++;
    } else
      i++;
  }

  if (k)  MMDB->MakeSelIndex ( selHnd );

  if (S)  delete[] S;

}

Boolean CSSGraph::inRange ( pstr chainID, int initPos, int endPos )  {
int i;
  for (i=0;i<nVertices;i++)
    if (Vertex[i]->inRange(chainID,initPos,endPos))  return True;
  return False;
}

pstr  CSSGraph::GetChainList ( pstr S )  {
//  returns comma-separated list of chains in graph's vertices
char N[100];
int  i;
  if (nVertices>0)  {
    if (!Vertex[0]->chainID[0])  strcpy ( S,"''" );
                           else  strcpy ( S,Vertex[0]->chainID );
    strcat ( S,"," );
    for (i=1;i<nVertices;i++)  {
      if (!Vertex[i]->chainID[0])  strcpy ( N,"''" );
                             else  strcpy ( N,Vertex[i]->chainID );
      strcat ( N,"," );
      if (!strstr(S,N))  strcat ( S,N );
    }
    if (!strcmp(S,"'',"))  S[0] = char(0);
                     else  S[strlen(S)-1] = char(0);
  } else
    S[0] = char(0);
  return S;
}

void  CSSGraph::Reset()  {
  FreeMemory();
}

void  CSSGraph::AddVertex ( PCSSVertex V )  {
int         i,nV1;
PPCSSVertex V1;
  if (nVertices>=nVAlloc)  {
    nV1 = nVertices + 20;
    V1  = new PCSSVertex[nV1];
    for (i=0;i<nVAlloc;i++)
      V1[i] = Vertex[i];
    for (i=nVAlloc;i<nV1;i++)
      V1[i] = NULL;
    if (Vertex)  delete[] Vertex;
    Vertex  = V1;
    nVAlloc = nV1;
  }
  Vertex[nVertices++] = V;
}

int  CSSGraph::GetSSEType ( pstr chainID, int atomPos )  {
//  Returns SSE type (V_HELIX or V_STRAND) for atom at atomPos
//  sequence position (0.. on ).
int  i,sse;
  sse = V_UNKNOWN;
  for (i=0;i<nVertices;i++)
    if ((!strcmp(Vertex[i]->chainID,chainID)) &&
        (Vertex[i]->initPos<=atomPos)         &&
        (atomPos<=Vertex[i]->endPos))  {
      sse = Vertex[i]->type;
      break;
    }
  return sse;
}

int  CSSGraph::GetSSEType ( PCAtom A )  {
//  Returns SSE type (V_HELIX or V_STRAND) for the atom
pstr chID;
int  i,sse,apos;
  sse = V_UNKNOWN;
  if (A)  {
    chID = A->GetChainID();
    if (chID)  {
      apos = A->GetResidueNo();
      for (i=0;i<nVertices;i++)
        if ((!strcmp(Vertex[i]->chainID,chID)) &&
            (Vertex[i]->initPos<=apos)         &&
            (apos<=Vertex[i]->endPos))  {
          sse = Vertex[i]->type;
          break;
        }
    }
  }
  return sse;
}

int  CSSGraph::MakeGraph ( PCMMDBManager MMDB )  {
PPCResidue res;
PCSSVertex vertex;
int        rc,nresidues,i,j,k,vtype;

  FreeMemory();

  rc = MMDB->GetModel(1)->CalcSecStructure ( True );
  if (rc!=SSERC_Ok)  return rc;

  res = NULL;
  MMDB->GetResidueTable ( res,nresidues );

  i = 0;
  k = 0;
  while (i<nresidues)  {
    while ((i<nresidues) && (res[i]->SSE!=SSE_Strand) &&
                            (res[i]->SSE!=SSE_Helix))  i++;
    if (i<nresidues)  {
      j = i;
      while ((i<nresidues) && (res[i]->SSE==res[j]->SSE) &&
             (!strcmp(res[i]->GetChainID(),res[j]->GetChainID())))  i++;
      if (res[j]->SSE==SSE_Strand)  vtype = V_STRAND;
                              else  vtype = V_HELIX;
      k++;
      vertex = new CSSVertex();
      if (vertex->SetVertex(MMDB,vtype,k,1,res[j]->GetChainID(),
                    res[j  ]->GetSeqNum(),res[j  ]->GetInsCode(),
                    res[i-1]->GetSeqNum(),res[i-1]->GetInsCode()))  {
        k--;
        delete vertex;
      } else
        AddVertex ( vertex );
    }
  }

  if (res)  delete[] res;

  if (nVertices<=0)  return SSGE_NoVertices;

  RepairSS ( MMDB );

  return SSGE_Ok;

}


void  CSSGraph::CalcVertexOrder()  {
int     i,i0,VNo;
Boolean Done;

  for (i=0;i<nVertices;i++)
    Vertex[i]->VNo = 0;

  do  {
    i0 = 0;
    while (i0<nVertices)
      if (Vertex[i0]->VNo==0)  break;
                         else  i0++;
    Done = (i0>=nVertices);
    if (!Done)  {
      VNo  = 0;
      for (i=0;i<nVertices;i++)
        if (!strcmp(Vertex[i]->chainID,Vertex[i0]->chainID))  {
          if (Vertex[i]->VNo>VNo)  VNo = Vertex[i]->VNo;
          if ((Vertex[i]->VNo==0) &&
              (Vertex[i]->endPos<=Vertex[i0]->initPos))
            i0 = i;
        }
      Vertex[i0]->VNo = VNo + 1;
    }
  } while (!Done);

}

#define  VXREP_SD    3
#define  VXREP_HX    3
#define  VXREP_DEV1  (Pi/9.0)
#define  VXREP_DEV2  (Pi/3.0)

void  CSSGraph::RepairSS ( PCMMDBManager MMDB )  {
// Reunites strands and helices separated by just a few
// residues if there are indications that that could
// be a single strand or helix.
PPCSSVertex Vx;
ChainID     chID;
realtype    adev1,adev2, vx,vy,vz;
int         i,j,k,j0,k0,k1,iPos;
Boolean     B;

  if (nVertices<=1)  return;

  adev1 = VXREP_DEV1;
  adev2 = VXREP_DEV2;

  Vx = new PCSSVertex[nVAlloc];
  k  = 0;

  for (i=0;i<nVertices;i++)
    if (Vertex[i])  {
      k0 = k;  // starting vertex for the chain
      strcpy ( chID,Vertex[i]->chainID );
      // Put all vertices of this chain into order
      // of increasing their position in the chain
      do  {
        j0   = -1;
        iPos = MaxInt;
        for (j=i;j<nVertices;j++)
          if (Vertex[j])  {
            if ((!strcmp(chID,Vertex[j]->chainID)) &&
                (Vertex[j]->initPos<=iPos))  {
              iPos = Vertex[j]->initPos;
              j0   = j;
            }
          }
        if (j0>=0)  {
          Vx[k++]    = Vertex[j0];
          Vertex[j0] = NULL;
        }
      } while (j0>=0);
      // Check pairs of neighbouring vertices for gaps
      // between them, and if the gaps are small while
      // the general direction is kept, merge the
      // vertices
      while (k0<k-1)  {
        k1 = k0 + 1;
        B  = (Vx[k0]->type==Vx[k1]->type);
        if (B)  {
          if (Vx[k0]->type==V_STRAND)
            B = ((Vx[k1]->initPos-Vx[k0]->endPos)<=VXREP_SD);
          else if (Vx[k0]->classID==Vx[k1]->classID)
            B = ((Vx[k1]->initPos-Vx[k0]->endPos)<=VXREP_HX);
          if (B)  {
            vx = Vx[k1]->GetX2() - Vx[k0]->GetX1();
            vy = Vx[k1]->GetY2() - Vx[k0]->GetY1();
            vz = Vx[k1]->GetZ2() - Vx[k0]->GetZ1();
            if (((Vx[k0]->GetAngle(vx,vy,vz)<=adev1)  ||
                 (Vx[k1]->GetAngle(vx,vy,vz)<=adev1)) &&
                 (Vx[k0]->GetAngle(Vx[k1])<=adev2))  {
              // Evidently k0 and k1 represent a broken strand/helix.
              // Restore it.
              Vx[k0]->SetVertex ( MMDB,Vx[k0]->type,Vx[k0]->serNum,
                        Vx[k0]->classID,chID,Vx[k0]->initSeqNum,
                        Vx[k0]->initICode,Vx[k1]->endSeqNum,
                        Vx[k1]->endICode );
              delete Vx[k1];
              k--; // one vertex less in the chain
              while (k1<k)  {
                Vx[k1] = Vx[k1+1];
                k1++;
              }
            } else
              B = False;
          }
        }
        if (!B)  k0++;
      }
    }

  delete[] Vertex;

  nVertices = k;
  while (k<nVAlloc)
    Vx[k++] = NULL;

  Vertex = Vx;

}

void  CSSGraph::BuildGraph()  {
int i,j;

  ReleaseEdges   ();
  CalcVertexOrder();

  nHelices = 0;
  nStrands = 0;

  if (nVertices>1)  {

    nGAlloc = nVertices;
    GetMatrixMemory ( graph,nGAlloc,nGAlloc,1,1 );

    //   Connect all vertices with edges. The following
    // is unsophisticated, but simple and reliable:
    for (i=1;i<=nVertices;i++)  {
      Vertex[i-1]->id = i;
      if (Vertex[i-1]->type==V_HELIX)  nHelices++;
                                 else  nStrands++;
      graph[i][i] = -1;
      for (j=i+1;j<=nVertices;j++)  {
        graph[i][j] = nEdges++;
        graph[j][i] = graph[i][j];
      }
    }

    if (nEdges>0)  {
      nEAlloc = nEdges;
      Edge    = new PCSSEdge[nEAlloc];
      nEdges  = 0;
      for (i=1;i<=nVertices;i++)
        for (j=i+1;j<=nVertices;j++)  {
          Edge[nEdges] = new CSSEdge();
          Edge[nEdges]->SetEdge ( Vertex[i-1],Vertex[j-1] );
          nEdges++;
        }
      if (nEdges!=nEAlloc)
        printf ( "\n #### PROGRAM ERROR IN CSSGraph::BuildGraph()\n" );
    }

  }

}

Boolean CSSGraph::isBuild()  {
  if (!graph)  return False;
  if (!Edge)   return False;
  return True;
}


void  CSSGraph::calcVTypes() {
int i;
  nHelices = 0;
  nStrands = 0;
  for (i=0;i<nVertices;i++)
    if (Vertex[i]->type==V_HELIX)  nHelices++;
                             else  nStrands++;
}

void  CSSGraph::ReleaseEdges()  {
int i;

  FreeMatrixMemory ( graph,nGAlloc,1,1 );
  nGAlloc = 0;

  for (i=0;i<nEAlloc;i++)
    if (Edge[i])  delete Edge[i];
  if (Edge)  delete[] Edge;
  Edge    = NULL;
  nEdges  = 0;
  nEAlloc = 0;

}

Boolean  CSSGraph::GetEdgeDirection ( int v1, int v2, vect3 & v )  {
  if (graph)  {
    if ((1<=v1) && (v1<=nVertices) &&
        (1<=v2) && (v2<=nVertices) && (v1!=v2))  {
      Edge[graph[v1][v2]]->GetDirection ( v );
      if (v1>v2)  {
        v[0] = -v[0];
        v[1] = -v[1];
        v[2] = -v[2];
      }
      return True;
    }
  }
  return False;
}

int  CSSGraph::CompareEdges ( int i, int j, PCSSGraph G,
                              int k, int l )  {
//   CompareEdges(..) compares edge (ij) of the graph with
// edge (kl) of graph G. i may be either less or greater
// than j, same about k and l. If edges compare, the function
// returns 0. Edges with equal indices (i.e. (ii) and (kk))
// are considered as comparable (returns 0).
//   The function may be used only after both graphs have
// been built.
  if (i==j)  {
    if (k==l)  return 0;
         else  return 7;
  } else if (k==l)
               return 7;
  return  Edge[graph[i][j]]->Compare (
                    (i>j),G->Edge[G->graph[k][l]],(k>l) );
}

int  CSSGraph::CheckEdgeConnectivity ( int i, int j, PCSSGraph G,
                                       int k, int l )  {
  if (i==j)  return -1;
  if (k==l)  return -1;
  return  Edge[graph[i][j]]->CheckConnectivity (
                    (i>j),G->Edge[G->graph[k][l]],(k>l) );
}

void  CSSGraph::RemoveShortVertices ( int nmin_hx, int nmin_sd )  {
PPCSSVertex V;
int         i,n;
  n = 0;
  for (i=0;i<nVertices;i++)
    if (Vertex[i])  {
      if (((Vertex[i]->type==V_HELIX)  && (Vertex[i]->nres>nmin_hx)) ||
          ((Vertex[i]->type==V_STRAND) && (Vertex[i]->nres>nmin_sd)))
        n++;
    }
  if (n<nVertices)  {
    if (n>0)  {
      V = new PCSSVertex[n];
      n = 0;
      for (i=0;i<nVertices;i++)
        if (Vertex[i])  {
          if (((Vertex[i]->type==V_HELIX)  && (Vertex[i]->nres>nmin_hx)) ||
              ((Vertex[i]->type==V_STRAND) && (Vertex[i]->nres>nmin_sd)))
                V[n++] = Vertex[i];
          else  delete Vertex[i];
        }
      for (i=nVertices;i<nVAlloc;i++)
        if (Vertex[i])  delete Vertex[i];
      delete[] Vertex;
      Vertex    = V;
      nVertices = n;
      nVAlloc   = 0;
    } else if (Vertex)  {
      for (i=0;i<nVAlloc;i++)
        if (Vertex[i])  delete Vertex[i];
      delete[] Vertex;
      Vertex    = NULL;
      nVertices = 0;
      nVAlloc   = 0;
    }
  }
  BuildGraph();
}


void  CSSGraph::LeaveVertices ( ivector vlist, int vllen )  {
int         i,j,n;
Boolean     B;
  n = 0;
  for (i=0;i<nVertices;i++)  {
    B = False;
    for (j=1;(j<=vllen) && (!B);j++)
      B = (vlist[j]==i+1);
    if (!B)  {
      if (Vertex[i])
        delete Vertex[i];
      Vertex[i] = NULL;
    } else if (n<i)  {
      Vertex[n++] = Vertex[i];
      Vertex[i]   = NULL;
    } else
      n++;
  }
  nVertices = n;
}


void  CSSGraph::LeaveVertices ( pstr select, PCMMDBManager M )  {
// select is of the following format:
//    "*", "(all)"            - take all file
//    "-"                     - take chain without chain ID
//    "a:Ni-Mj,b:Kp-Lq,..."   - take chain a residue number N
//                              insertion code i to residue number M
//                              insertion code j plus chain b
//                              residue number K insertion code p to
//                              residue number L insertion code q and
//                              so on.
//    "a:,b:..."              - take whole chains a and b and so on
//    "a:,b:Kp-Lq,..."        - any combination of the above.
int  rc,selHnd1;
  rc = SelectDomain ( M,selHnd1,select,STYPE_RESIDUE );
  if (!rc)  _leaveVertices ( M,selHnd1 );
  M->DeleteSelection ( selHnd1 );
}


void  CSSGraph::LeaveVertices ( int selHnd, PCMMDBManager M )  {
//  Leaves only vertices that are covered by the given selection.
//  selHnd may refer to the selection of atoms, residues or chains.
int  stype,selHnd1;

  stype = M->GetSelType ( selHnd );
  if ((stype==STYPE_INVALID) || (stype==STYPE_UNDEFINED))
    return;

  if (stype==STYPE_RESIDUE)  selHnd1 = selHnd;
  else  {
    selHnd1 = M->NewSelection();
    M->Select ( selHnd1,STYPE_RESIDUE,selHnd,SKEY_NEW );
  }

  _leaveVertices ( M,selHnd1 );

  if (stype!=STYPE_RESIDUE)  M->DeleteSelection ( selHnd1 );

}


void  CSSGraph::_leaveVertices ( PCMMDBManager M, int selHnd1 )  {
int  selHnd2, i,j,n;

  selHnd2 = M->NewSelection();

  n = 0;
  for (i=0;i<nVertices;i++)
    if (Vertex[i])  {
      M->Select ( selHnd2,STYPE_RESIDUE,1,Vertex[i]->chainID,
                  Vertex[i]->initSeqNum,Vertex[i]->initICode,
                  Vertex[i]->endSeqNum ,Vertex[i]->endICode ,
                  "*","*","*","*",SKEY_NEW );
      M->Select ( selHnd2,STYPE_RESIDUE,selHnd1,SKEY_AND );
      if (M->GetSelLength(selHnd2)<=0)  {
        delete Vertex[i];
        Vertex[i] = NULL;
      } else if (n<i)  {
        Vertex[n++] = Vertex[i];
        Vertex[i]   = NULL;
      } else
        n++;
    }

  nVertices = n;

  M->DeleteSelection ( selHnd2 );

}


void  CSSGraph::RemoveVertex ( int vertex_no )  {
int  i;
  if ((0<vertex_no) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  delete Vertex[vertex_no-1];
    for (i=vertex_no;i<nVertices;i++)
      Vertex[i-1] = Vertex[i];
    Vertex[nVertices-1] = NULL;
    nVertices--;
  }
}


int  CSSGraph::GetVertexType ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->type;
  }
  return V_UNKNOWN;
}

int  CSSGraph::GetVertexClass ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->classID;
  }
  return 0;
}

Boolean  CSSGraph::GetVertexDirection ( int vertex_no, vect3 & v )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  {
      Vertex[vertex_no-1]->GetDirection ( v );
      return True;
    }
  }
  return False;
}

int  CSSGraph::GetSeqLength ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->nres;
  }
  return V_UNKNOWN;
}

realtype CSSGraph::GetMass ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->mass;
  }
  return 0.0;
}

PCSSVertex  CSSGraph::GetGraphVertex ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))
        return Vertex[vertex_no-1];
  else  return NULL;
}

pstr CSSGraph::GetVertexChainID ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->chainID;
  }
  return NULL;
}

pstr CSSGraph::GetVertexInitRes ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->initResName;
  }
  return NULL;
}

pstr CSSGraph::GetVertexEndRes ( int vertex_no )  {
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    if (Vertex[vertex_no-1])  return Vertex[vertex_no-1]->endResName;
  }
  return NULL;
}

void CSSGraph::GetVertexRange ( int vertex_no, ChainID chID,
                                int & initSeqNum, InsCode initICode,
                                int & endSeqNum,  InsCode endICode )  {
int vn;
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    vn = vertex_no - 1;
    if (Vertex[vn])  {
      strcpy ( chID,Vertex[vn]->chainID );
      initSeqNum = Vertex[vn]->initSeqNum;
      endSeqNum  = Vertex[vn]->endSeqNum;
      strcpy ( initICode,Vertex[vn]->initICode );
      strcpy ( endICode ,Vertex[vn]->endICode  );
      return;
    }
  }
  chID[0]      = char(0);
  initSeqNum   = ANY_RES;
  endSeqNum    = ANY_RES;
  initICode[0] = char(0);
  endICode[0]  = char(0);
}

void CSSGraph::GetVertexRange ( int vertex_no, ChainID chID,
                                int & initPos, int & endPos )  {
int vn;
  if ((vertex_no>0) && (vertex_no<=nVertices))  {
    vn = vertex_no - 1;
    if (Vertex[vn])  {
      strcpy ( chID,Vertex[vn]->chainID );
      initPos = Vertex[vn]->initPos;
      endPos  = Vertex[vn]->endPos;
      return;
    }
  }
  chID[0] = char(0);
  initPos = ANY_RES;
  endPos  = ANY_RES;
}

PCSSEdge CSSGraph::GetGraphEdge ( int edge_no )  {
  if ((edge_no>0) && (edge_no<=nEdges))
        return Edge[edge_no-1];
  else  return NULL;
}

PCSSEdge CSSGraph::GetGraphEdge ( int v1, int v2 )  {
  if (graph && (1<=v1) && (v1<=nVertices) &&
               (1<=v2) && (v2<=nVertices) &&
               (v1!=v2))
       return Edge[graph[v1][v2]];
  else return NULL;
}


realtype CSSGraph::CalcCombinations ( ivector F, int nm )  {
//
//   F contains list of nm graph vertices (e.g. those matched),
// the function returns the number of combinations these
// vertices may be picked from the graph, taking into account
// their type, length and sequence order.
//
rmatrix  C;
realtype nCombs;
int      i,j,k,k0;

  if ((nm<=0) || (nVertices<nm))  return 1.0;

  GetMatrixMemory ( C,nm,nVertices,1,1 );
  for (i=1;i<=nm;i++)
    for (j=1;j<=nVertices;j++)
      C[i][j] = 0.0;

  k0 = 0;
  for (i=1;i<=nm;i++)  {
    k = MaxInt4;
    for (j=1;j<=nm;j++)
      if ((F[j]>k0) && (F[j]<k))  k = F[j];
    if (k<MaxInt4)  {
      k0 = k;
      k--;
      for (j=i;j<=nVertices-nm+i;j++)
        if (Vertex[k]->Compare(Vertex[j-1]))  C[i][j] = 1.0;
    }
  }

  for (j=nVertices-1;j>=nm;j--)
    C[nm][j] += C[nm][j+1];

  for (i=nm-1;i>=1;i--)
    for (j=nVertices-nm+i;j>=i;j--)
      if (C[i+1][j+1]<=0.01)  C[i][j] = 0.0;
      else if (C[i][j]<=0.01) C[i][j] = C[i][j+1];
                         else C[i][j] = C[i][j+1] + C[i+1][j+1];

  nCombs = C[1][1];
  FreeMatrixMemory ( C,nm,1,1 );

  return nCombs;

}


void  CSSGraph::GetAllChains ( PChainID & chain, int & nchains )  {
//  returns all chain IDs found in the graph's vertices
int  i,j,k;
  nchains = 0;
  if (chain)  {
    delete[] chain;
    chain = NULL;
  }
  if (nVertices>0)  {
    chain = new ChainID[nVertices];
    for (i=0;i<nVertices;i++)  {
      k = 0;
      // is chain of this vertex already counted?
      for (j=0;(j<nchains) && (k==0);j++)
        if (!strcmp(chain[j],Vertex[i]->chainID))  k = 1;
      if (k==0)  {
        // register the chain
        strcpy ( chain[nchains],Vertex[i]->chainID );
        nchains++;
      }
    }
  }
}


int  CSSGraph::GetNofChains()  {
// counts number of chains == number of single-chain graphs
PChainID  chain;
int       nchains;
  chain = NULL;
  GetAllChains ( chain,nchains );
  return nchains;
}

void  CSSGraph::DevelopChainGraphs ( PPCSSGraph & G, int & nGraphs )  {
PChainID   S;
int        i,j,k;
PCSSVertex V;

  DisposeSSGraphs ( G,nGraphs );

  if (nVertices>0)  {

    // count number of chains == number of single-chain graphs
    S = new ChainID[nVertices];
    for (i=0;i<nVertices;i++)  {
      k = 0;
      // is chain of this vertex already counted?
      for (j=0;(j<nGraphs) && (k==0);j++)
        if (!strcmp(S[j],Vertex[i]->chainID))  k = 1;
      if (k==0)  {
        // register the chain
        strcpy ( S[nGraphs],Vertex[i]->chainID );
        nGraphs++;
      }
    }

    if (nGraphs>0)  {
      G = new PCSSGraph[nGraphs];
      for (i=0;i<nGraphs;i++)  {
        G[i] = new CSSGraph();
        CreateCopy   ( G[i]->name    ,name     );
        CreateConcat ( G[i]->name    ,":",S[i] );
        strcpy       ( G[i]->devChain,S[i]     );
        for (j=0;j<nVertices;j++)
          if (!strcmp(S[i],Vertex[j]->chainID))  {
            V = new CSSVertex();
            V->Copy ( Vertex[j] );
            G[i]->AddVertex ( V );
          }
        G[i]->BuildGraph();
      }
    }

    delete[] S;

  }

}


void  CSSGraph::Superpose ( PCSSGraph G, ivector F1, ivector F2,
                            int nMatch, mat44 & TMatrix )  {
//  Returns TMatrix - a transformation matrix for G's coordinates,
//  such that TMatrix*{G} ~= {this}
//    F1 is for this graph, F2 = for G.
  SuperposeSSGraphs ( G,F2,this,F1,nMatch,TMatrix );
}


void  CSSGraph::Copy ( PCSSGraph G )  {
int i;

  FreeMemory();

  CreateCopy ( name       ,G->name        );
  strcpy     ( devChain   ,G->devChain    );

  nVertices = G->nVertices;
  if (nVertices>0)  {
    nVAlloc = nVertices;
    Vertex  = new PCSSVertex[nVertices];
    for (i=0;i<nVertices;i++)  {
      Vertex[i] = new CSSVertex();
      Vertex[i]->Copy ( G->Vertex[i] );
    }
  }

}


void  CSSGraph::write ( RCFile f )  {
int i;
int Version=1;

  f.WriteInt     ( &Version       );
  f.CreateWrite  ( name           );
  f.WriteTerLine ( devChain,False );
  f.WriteInt     ( &nVertices     );
  for (i=0;i<nVertices;i++)
    StreamWrite ( f,Vertex[i] );

}

void  CSSGraph::read ( RCFile f )  {
int i,Version;

  FreeMemory();

  f.ReadInt     ( &Version       );
  f.CreateRead  ( name           );
  f.ReadTerLine ( devChain,False );
  f.ReadInt     ( &nVertices     );
  if (nVertices>0)  {
    nVAlloc = nVertices;
    Vertex  = new PCSSVertex[nVertices];
    for (i=0;i<nVertices;i++)  {
      Vertex[i] = NULL;
      StreamRead ( f,Vertex[i] );
    }
  }

}

MakeStreamFunctions(CSSGraph)



//  ==================================================================


void  DisposeSSGraphs ( PPCSSGraph & G, int & nGraphs )  {
int i;
  if (G)  {
    for (i=0;i<nGraphs;i++)
      if (G[i])  delete G[i];
    delete[] G;
  }
  G       = NULL;
  nGraphs = 0;
}



int  SuperposeSSGraphs ( PCSSGraph G1, ivector F1,
                         PCSSGraph G2, ivector F2,
                         int     matchlen,
                         mat44 & TMatrix )  {
PCSSVertex Vx;
rmatrix    A,U,V;
rvector    W,RV1;
vect3      v1,v2;
realtype   det,B, x01,y01,z01, x02,y02,z02, mass,mass1,mass2;
int        i,j,k,l, nE1,nE2;

  nE1 = G1->GetNofEdges();
  if (!nE1)  G1->BuildGraph();

  nE2 = G2->GetNofEdges();
  if (!nE2)  G2->BuildGraph();

  GetMatrixMemory ( A,3,3,1,1 );
  GetMatrixMemory ( U,3,3,1,1 );
  GetMatrixMemory ( V,3,3,1,1 );
  GetVectorMemory ( W,3,1 );
  GetVectorMemory ( RV1,3,1 );

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)
      A[j][k] = 0.0;

  for (i=1;i<=matchlen;i++)  {
    Vx = G1->GetGraphVertex ( F1[i] );
    Vx->GetDirection ( v1 );
    Vx = G2->GetGraphVertex ( F2[i] );
    Vx->GetDirection ( v2 );
    for (j=1;j<=3;j++)
      for (k=1;k<=3;k++)
        A[j][k] += v1[k-1]*v2[j-1];
  }

  for (i=1;i<matchlen;i++)
    for (l=i+1;l<=matchlen;l++)
      if (G1->GetEdgeDirection(F1[i],F1[l],v1) &&
          G2->GetEdgeDirection(F2[i],F2[l],v2))
        for (j=1;j<=3;j++)
          for (k=1;k<=3;k++)
            A[j][k] += v1[k-1]*v2[j-1];

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

  if (det<0.0)  {
    k = 0;
    B = MaxReal;
    for (j=1;j<=3;j++)
      if (W[j]<B)  {
        B = W[j];
        k = j;
      }
    for (j=1;j<=3;j++)
      V[k][j] = -V[k][j];
  }

  for (j=1;j<=3;j++)
    for (k=1;k<=3;k++)  {
      B = 0.0;
      for (i=1;i<=3;i++)
        B += U[j][i]*V[k][i];
      TMatrix[j-1][k-1] = B;
    }


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
  TMatrix[0][3] = x02 - TMatrix[0][0]*x01 - TMatrix[0][1]*y01 -
                        TMatrix[0][2]*z01;
  TMatrix[1][3] = y02 - TMatrix[1][0]*x01 - TMatrix[1][1]*y01 -
                        TMatrix[1][2]*z01;
  TMatrix[2][3] = z02 - TMatrix[2][0]*x01 - TMatrix[2][1]*y01 -
                        TMatrix[2][2]*z01;

  FreeMatrixMemory ( A,1,1 );
  FreeMatrixMemory ( U,1,1 );
  FreeMatrixMemory ( V,1,1 );
  FreeVectorMemory ( W,1 );
  FreeVectorMemory ( RV1,1 );

  if (!nE1)  G1->ReleaseEdges();
  if (!nE2)  G2->ReleaseEdges();

  return 0;

}


void CalcCombinations ( rvector & combs, int & vlen,
                        PCSSGraph G1, PCSSGraph G2 )  {
//  combs[i], i=1..vlen, returns the number of common
//  substructures of size i of graphs G1 and G2. The
//  sequential order of graph vertices is taken into
//  account, however the actual edges are completely
//  neglected.
PPCSSVertex V1,V2;
rmatrix3    P;
imatrix     C;
realtype    q;
int         n,m, i,j,k;

  n = G1->GetNofVertices();
  m = G2->GetNofVertices();
  if (n<=m)  {
    V1 = G1->GetVertices();
    V2 = G2->GetVertices();
  } else  {
    m  = G1->GetNofVertices();
    n  = G2->GetNofVertices();
    V2 = G1->GetVertices();
    V1 = G2->GetVertices();
  }

  vlen = 0;
  FreeVectorMemory ( combs,1 );
  if (n<=0)  return;

  GetMatrix3Memory ( P,n,m,n,1,1,1 );
  GetMatrixMemory  ( C,n,m,1,1 );
  for (i=1;i<=n;i++)
    for (j=1;j<=m;j++)  {
      if (V1[i-1]->Compare(V2[j-1]))  C[i][j] = 1;
                                else  C[i][j] = 0;
      for (k=1;k<=n;k++)
        P[i][j][k] = 0.0;
    }

  q = 0.0;
  for (j=1;j<=m;j++)  {
    q += C[1][j];
    P[1][j][1] = q;
  }

  for (i=2;i<=n;i++)  {

    q = 0.0;
    for (j=1;j<=m;j++)  {
      q += C[i][j];
      P[i][j][1] = P[i-1][j][1] + q;
    }

    for (k=2;k<=i;k++)  {
      for (j=k;j<=m;j++)
        if (C[i][j]==0)  P[i][j][k] = P[i][j-1][k];
                   else  P[i][j][k] = P[i][j-1][k] + P[i-1][j-1][k-1];
      for (j=k;j<=m;j++)
        P[i][j][k] += P[i-1][j][k];
    }

  }

  vlen = n;
  GetVectorMemory ( combs,n,1 );
  for (k=1;k<=n;k++)
    combs[k] = P[n][m][k];

  FreeMatrix3Memory ( P,n,m,1,1,1 );
  FreeMatrixMemory  ( C,n,1,1 );

}
