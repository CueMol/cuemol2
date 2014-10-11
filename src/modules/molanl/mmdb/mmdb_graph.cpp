//  $Id: mmdb_graph.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
//  =================================================================
//
//   CCP4 Coordinate Library: support of coordinate-related
//   functionality in protein crystallography applications.
//
//   Copyright (C) Eugene Krissinel 2000-2008.
//
//    This library is free software: you can redistribute it and/or 
//    modify it under the terms of the GNU Lesser General Public 
//    License version 3, modified in accordance with the provisions 
//    of the license to address the requirements of UK law.
//
//    You should have received a copy of the modified GNU Lesser 
//    General Public License along with this library. If not, copies 
//    may be downloaded from http://www.ccp4.ac.uk/ccp4license.php
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU Lesser General Public License for more details.
//
//  =================================================================
//
//    08.07.08   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_graph  <implementation>
//       ~~~~~~~~~
//  **** Classes :  CVertex     ( graph vertex                       )
//       ~~~~~~~~~  CEdge       ( graph edge                         )
//                  CGraph      ( structural graph                   )
//                  CMatch      ( match of structural graphs         )
//                  CGraphMatch ( CSIA algorithms for graph matching )
//
//   (C) E. Krissinel 2000-2008
//
//  When used, please cite:
//
//   Krissinel, E. and Henrick, K. (2004)
//   Common subgraph isomorphism detection by backtracking search.
//   Software - Practice and Experience, 34, 591-607.
//
//  =================================================================
//

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __MMDB_Graph__
#include "mmdb_graph.h"
#endif

#ifndef  __MMDB_Tables__
#include "mmdb_tables.h"
#endif


//  ==========================  CVertex  ============================

CVertex::CVertex() : CStream()  {
  InitVertex();
}

CVertex::CVertex ( RPCStream Object ) : CStream(Object)  {
  InitVertex();
}

CVertex::CVertex ( cpstr chem_elem )
       : CStream()  {
  InitVertex();
  SetVertex ( chem_elem );
}

CVertex::CVertex ( int vtype )
       : CStream()  {
  InitVertex();
  SetVertex ( vtype );
}

CVertex::CVertex ( int vtype, cpstr vname )
       : CStream()  {
  InitVertex();
  SetVertex ( vtype,vname );
}

CVertex::CVertex ( cpstr chem_elem, cpstr vname )
       : CStream()  {
  InitVertex ();
  SetVertex  ( chem_elem  );
  CreateCopy ( name,vname );
}

CVertex::~CVertex() {
  if (name) delete[] name;
}

void  CVertex::InitVertex()  {
  name     = NULL;
  type     = 0;
  property = 0;
  id       = 0;
  userid   = 0;
}


void  CVertex::SetVertex ( cpstr chem_elem )  {
//   This function generates vertex type according to a chemical
// element name passed in chem_elem.
//
//   The element type has the following meaning:
//
//     0xCHSSTTTT
//
// where
//        T - resreved for elemenmt type
//        S - resreved for symmetry relief
//        H - reserved for hydrogen bonds
//        C - resreved for chirality flags
//
// Note that when more than 2 symbols are used for chemical element
// name (custom use), fields S may be reallocated for element type
// and then symmetry relief becomes impossible.
//
  CreateCopy ( name,chem_elem );
  type = getElementNo ( chem_elem );
  if (type==ELEMENT_UNKNOWN)  {
    type = 0;
    if (name[0])  {
      type = (int)name[0];
      if (name[1])  {
        type = type*256+(int)name[1];
        if (name[2])  type = type*256+(int)name[2];
      }
    }
    type += nElementNames;
  }
}

void  CVertex::SetVertex ( int vtype )  {
//  This function sets vertex type. See comments above for
// the general rule for vertex types implied by this code.
char N[50];
int  type0;
  type  = vtype;
  type0 = vtype & TYPE_MASK;
  if ((type0>=1) && (type0<=nElementNames))
    CreateCopy ( name,ElementName[type0-1] );
  else  {
    sprintf    ( N,"%i",type );
    CreateCopy ( name,N );
  }
}

void  CVertex::SetType ( int vtype )  {
  type = vtype;
}

void  CVertex::SetVertex ( int vtype, cpstr vname )  {
  type = vtype;
  CreateCopy ( name,vname );
}

void  CVertex::SetName ( cpstr vname )  {
  CreateCopy ( name,vname );
}

void  CVertex::SetID ( int vid )  {
  id = vid;
}

void  CVertex::SetProperty ( int vprop )  {
  property = vprop;
}

int   CVertex::GetNBonds()  {
  return  ((type & HYDROGEN_BOND) >> 24);
}

void  CVertex::AddBond()  {
int nb = GetNBonds()+1;
  type &= ~HYDROGEN_BOND;
  type |= nb << 24;
}

void  CVertex::CopyNBonds ( PCVertex V )  {
int nb = V->GetNBonds();
  type &= ~HYDROGEN_BOND;
  type |= nb << 24;
}

void  CVertex::RemoveChirality()  {
  type &= CHIRAL_MASK;
}

void  CVertex::LeaveChirality ( int eltype )  {
// leaves chirality only on specified elements
int vtype;
  vtype = type & CHIRAL_MASK;
  if (vtype!=eltype)  type = vtype;
}

void  CVertex::SaveType()  {
  userid = type;
}

void  CVertex::RestoreType()  {
  type = userid;
}

void  CVertex::CopyType ( PCVertex V )  {
  type = V->type;
}


void  CVertex::Print ( int PKey )  {
  if (PKey!=0)
        printf ( "    name    type" );
  else  printf ( " %10s  %5i",name,type );
}

void  CVertex::Copy ( PCVertex V )  {
  CreateCopy ( name,V->name );
  type     = V->type;
  property = V->property;
  id       = V->id;
  userid   = V->userid;
}

void  CVertex::write ( RCFile f )  {
int Version=1;
  f.WriteInt    ( &Version  );
  f.CreateWrite ( name      );
  f.WriteInt    ( &type     );
  f.WriteInt    ( &property );
  f.WriteInt    ( &id       );
  f.WriteInt    ( &userid   );
}

void  CVertex::read  ( RCFile f )  {
int Version;
  f.ReadInt    ( &Version  );
  f.CreateRead ( name      );
  f.ReadInt    ( &type     );
  f.ReadInt    ( &property );
  f.ReadInt    ( &id       );
  f.ReadInt    ( &userid   );
}

void  CVertex::mem_write ( pstr S, int & l )  {
  ::mem_write ( name    ,S,l );
  ::mem_write ( type    ,S,l );
  ::mem_write ( property,S,l );
  ::mem_write ( id      ,S,l );
  ::mem_write ( userid  ,S,l );
}

void  CVertex::mem_read ( cpstr S, int & l )  {
  ::mem_read ( name    ,S,l );
  ::mem_read ( type    ,S,l );
  ::mem_read ( property,S,l );
  ::mem_read ( id      ,S,l );
  ::mem_read ( userid  ,S,l );
}

MakeStreamFunctions(CVertex)



//  ===========================  CEdge  =============================

CEdge::CEdge() : CStream()  {
  InitEdge();
}

CEdge::CEdge ( RPCStream Object ) : CStream(Object)  {
  InitEdge();
}

CEdge::CEdge ( int vx1, int vx2, int btype )  {
  InitEdge();
  SetEdge ( vx1,vx2,btype );
}

CEdge::~CEdge()  {}

void  CEdge::InitEdge()  {
  v1       = 0;
  v2       = 0;
  type     = 0;
  property = 0;
}


#define NofBondTypes  4

static pstr BondType[NofBondTypes+1] = {
  pstr("SING"), pstr("DOUB"), pstr("AROM"), pstr("TRIP"),
  pstr("")  // should be here for safety
};


void  CEdge::SetEdge ( int vx1, int vx2, cpstr btype )  {
  v1   = vx1;
  v2   = vx2;
  type = 0;
  while (type<NofBondTypes)
    if (!strncasecmp(btype,BondType[type],4))  break;
                                         else  type++;
  if (type>=NofBondTypes)  {
    type = 0;
    if (btype[0])  type = (int)btype[0];
    if (btype[1])  type = type*16+(int)btype[1];
    if (btype[2])  type = type*16+(int)btype[2];
    type += NofBondTypes;
  }
  type++;
}

void  CEdge::SetEdge ( int vx1, int vx2, int btype )  {
  v1   = vx1;
  v2   = vx2;
  type = btype;
}

void  CEdge::SetType ( int btype )  {
  type = btype;
}

void  CEdge::SetProperty ( int eprop )  {
  property = eprop;
}

void  CEdge::SaveType()  {
  property = type;
}

void  CEdge::RestoreType()  {
  type = property;
}

void  CEdge::Print ( int PKey )  {
  if (PKey!=0)
        printf ( "   v1  v2  type" );
  else  printf ( " %5i %5i  %5i",v1,v2,type );
}

void  CEdge::Copy ( PCEdge G )  {
  v1       = G->v1;
  v2       = G->v2;
  type     = G->type;
  property = G->property;
}

void  CEdge::write ( RCFile f )  {
int Version=1;
  f.WriteInt ( &Version  );
  f.WriteInt ( &v1       );
  f.WriteInt ( &v2       );
  f.WriteInt ( &type     );
  f.WriteInt ( &property );
}

void  CEdge::read  ( RCFile f )  {
int Version;
  f.ReadInt ( &Version  );
  f.ReadInt ( &v1       );
  f.ReadInt ( &v2       );
  f.ReadInt ( &type     );
  f.ReadInt ( &property );
}

void  CEdge::mem_write ( pstr S, int & l )  {
  ::mem_write ( v1      ,S,l );
  ::mem_write ( v2      ,S,l );
  ::mem_write ( type    ,S,l );
  ::mem_write ( property,S,l );
}

void  CEdge::mem_read ( cpstr S, int & l )  {
  ::mem_read ( v1      ,S,l );
  ::mem_read ( v2      ,S,l );
  ::mem_read ( type    ,S,l );
  ::mem_read ( property,S,l );
}


MakeStreamFunctions(CEdge)



//  ==========================  CGraph  ============================

CGraph::CGraph() : CStream()  {
  InitGraph();
}

CGraph::CGraph ( PCResidue R, cpstr altLoc ) : CStream()  {
  InitGraph();
  MakeGraph ( R,altLoc );
}

CGraph::CGraph ( RPCStream Object ) : CStream(Object)  {
  InitGraph();
}

CGraph::~CGraph()  {
  FreeMemory();
}

void CGraph::InitGraph()  {
  nVAlloc      = 0;
  nEAlloc      = 0;
  nGAlloc      = 0;
  nVertices    = 0;
  nEdges       = 0;
  nAllVertices = 0;
  nAllEdges    = 0;
  Vertex       = NULL;
  Edge         = NULL;
  graph        = NULL;
  name         = NULL;
  CreateCopy ( name,pstr("UNNAMED") );
}

void CGraph::FreeMemory()  {
int i;

  if (Vertex)  {
    for (i=0;i<nVAlloc;i++)
      if (Vertex[i])
        delete Vertex[i];
    delete[] Vertex;
  }
  nVAlloc      = 0;
  nVertices    = 0;
  nAllVertices = 0;
  Vertex       = NULL;

  if (Edge)  {
    for (i=0;i<nEAlloc;i++)
      if (Edge[i])
        delete Edge[i];
    delete[] Edge;
  }
  nEAlloc   = 0;
  nEdges    = 0;
  nAllEdges = 0;
  Edge      = NULL;

  FreeMatrixMemory ( graph,nGAlloc,1,1 );
  nGAlloc = 0;

  if (name)  delete[] name;
  name = NULL;

}

void  CGraph::Reset()  {
  FreeMemory();
  CreateCopy ( name,pstr("UNNAMED") );  
}

void  CGraph::SetName ( cpstr gname )  {
  CreateCopy ( name,gname );
}


static int AllocPortion = 100;

void  SetGraphAllocPortion ( int alloc_portion )  {
  AllocPortion = alloc_portion;
}

void  CGraph::AddVertex ( PCVertex V )  {
int        i;
PCVertex * V1;

  if (nAllVertices>=nVAlloc)  {
    nVAlloc += AllocPortion;
    V1       = new PCVertex[nVAlloc];
    for (i=0;i<nAllVertices;i++)
      V1[i] = Vertex[i];
    for (i=nAllVertices;i<nVAlloc;i++)
      V1[i] = NULL;
    if (Vertex)  delete[] Vertex;
    Vertex = V1;
  }
  if (Vertex[nAllVertices])
    delete Vertex[nAllVertices];
  Vertex[nAllVertices] = V;
  nAllVertices++;
  nVertices = nAllVertices;

}

void  CGraph::SetVertices ( PPCVertex V, int vlen )  {
  if (nVAlloc>0)  FreeMemory();
  Vertex       = V;
  nVertices    = vlen;
  nAllVertices = vlen;
  nVAlloc      = vlen;
}

int  CGraph::GetVertexID ( int vertexNo )  {
  if ((vertexNo>0) && (vertexNo<=nAllVertices))
        return Vertex[vertexNo-1]->GetID();
  else  return MinInt4;
}

int  CGraph::GetNBondedVertices ( int vertexNo )  {
  if ((vertexNo>0) && (vertexNo<=nAllVertices))  {
    if (Vertex[vertexNo-1])
      return Vertex[vertexNo-1]->GetNBonds();
  }
  return 0;
}

int  CGraph::GetBondedVertexID ( int vertexNo, int bond_vx_type,
                                 int bondNo )  {
int i,k, v1,v2;
  if ((vertexNo>0) && (vertexNo<=nAllVertices))  {
    if (Vertex[vertexNo-1])  {
      if (Vertex[vertexNo-1]->GetNBonds()>=bondNo)  {
        k = 0;
        for (i=0;(i<nAllEdges) && (!k);i++)
          if (Edge[i])  {
            v1 = Edge[i]->v1;
            v2 = Edge[i]->v2;
            if ((v1==vertexNo) &&
                ((Vertex[v2-1]->type & TYPE_MASK)==bond_vx_type) &&
                 (Vertex[v2-1]->GetNBonds()==bondNo))
               k = v2;
            if ((v2==vertexNo) &&
                ((Vertex[v1-1]->type & TYPE_MASK)==bond_vx_type) &&
                 (Vertex[v2-1]->GetNBonds()==bondNo))
               k = v1;
          }
        if (k)  return Vertex[k-1]->GetID();
      }
    }
  }
  return MinInt4;
}

PCVertex CGraph::GetVertex ( int vertexNo )  {
  if ((vertexNo>0) && (vertexNo<=nAllVertices))
        return Vertex[vertexNo-1];
  else  return NULL;
}

PCEdge CGraph::GetEdge ( int edgeNo )  {
  if ((edgeNo>0) && (edgeNo<=nAllEdges))
        return Edge[edgeNo-1];
  else  return NULL;
}

void  CGraph::AddEdge ( PCEdge G )  {
int     i;
PPCEdge G1;

  if (nAllEdges>=nEAlloc)  {
    nEAlloc += AllocPortion;
    G1       = new PCEdge[nEAlloc];
    for (i=0;i<nAllEdges;i++)
      G1[i] = Edge[i];
    for (i=nAllEdges;i<nEAlloc;i++)
      G1[i] = NULL;
    if (Edge)  delete[] Edge;
    Edge = G1;
  }
  if (Edge[nAllEdges])
    delete Edge[nAllEdges];
  Edge[nAllEdges] = G;
  nAllEdges++;
  nEdges = nAllEdges;

}

void  CGraph::SetEdges ( PPCEdge G, int glen )  {
  if (nEAlloc>0)  FreeMemory();
  Edge      = G;
  nEdges    = glen;
  nAllEdges = glen;
  nEAlloc   = glen;
}

void  CGraph::GetVertices ( PPCVertex & V, int & nV )  {
  V  = Vertex;
  nV = nVertices;
}

void  CGraph::GetEdges ( PPCEdge & E, int & nE )  {
  E  = Edge;
  nE = nEdges;
}


int  CGraph::MakeGraph ( PCResidue R, cpstr altLoc )  {
int      i,j, a1,a2,e1,e2, nAltLocs,alflag, rc;
Boolean  B;
rvector  occupancy;
AltLoc   aLoc;
PAltLoc  aL;
realtype dx,dy,dz, sr;
PCEdge   G;

  rc = MKGRAPH_Ok;
  //  reset graph
  FreeMemory();

  occupancy = NULL;
  aL        = NULL;
  R->GetAltLocations ( nAltLocs,aL,occupancy,alflag );
  if (nAltLocs<=0)  return MKGRAPH_NoAtoms;

  if (altLoc)  strcpy ( aLoc,altLoc );
         else  aLoc[0] = char(0);
  if (nAltLocs<=1)  {
    // Only one alt code is there, check if it is what was ordered
    if (strcmp(aLoc,aL[0]))  {
      rc = MKGRAPH_ChangedAltLoc;
      strcpy ( aLoc,aL[0] );
    }
  } else if ((alflag & ALF_Mess) || 
             ((alflag & ALF_NoEmptyAltLoc) && (!aLoc[0])))  {
    // There is a mess in the residue alt codes, or empty alt code
    // does not designate a conformation but ordered. In this
    // situation build graph for maximal-occupancy conformation
    // and store its altLoc in aLoc.
    rc = MKGRAPH_MaxOccupancy;
    dx = -2.0;
    for (i=0;i<nAltLocs;i++)
      if ((aL[i][0]) && (occupancy[i]>dx))  {
        dx = occupancy[i];
        strcpy ( aLoc,aL[i] );
      }
  }

  SetName ( R->name );

  nVAlloc = R->nAtoms;  // upper estimate for vertices to allocate
  if (nVAlloc<=0)  {
    if (aL)  delete[] aL;
    FreeVectorMemory ( occupancy,0 );
    return MKGRAPH_NoAtoms;
  }

  //  allocate vertex array
  Vertex = new PCVertex[nVAlloc];
  for (i=0;i<nVAlloc;i++)
    Vertex[i] = NULL;

  //  make vertices
  for (i=0;i<R->nAtoms;i++)
    if (R->atom[i])  {
      if (!R->atom[i]->Ter)  {
        if (nAltLocs>1)  {
          // This is a many-altcode residue. aLoc contains the altcode
          // that has to be included. Check on it:
          B = !strcmp(aLoc,R->atom[i]->altLoc);
          if ((!B) && (!R->atom[i]->altLoc[0]))  {
            // We got a non-aLoc code that is an "empty-altcode".
            // Check if this atom has the altcode that we need.
            for (j=i+1;(j<R->nAtoms) && (!B);j++)
              if (R->atom[j])  {
                if ((!R->atom[j]->Ter) && 
                    (!strcmp(R->atom[j]->name,R->atom[i]->name)))
                  B = !strcmp(aLoc,R->atom[j]->altLoc);
              }
            // if altcode=aLoc is not there for the atom (B is set
            // False) then we take its "empty-code" location
            B = !B;
          }
        } else
          B = True;
        if (B)  {
          Vertex[nVertices] = new CVertex ( R->atom[i]->element,
                                            R->atom[i]->name );
          Vertex[nVertices]->id     = nVertices;
          Vertex[nVertices]->userid = i;
          nVertices++;
        }
      }
    }

  if (nVertices<=0)  {
    if (aL)  delete[] aL;
    FreeVectorMemory ( occupancy,0 );
    return MKGRAPH_NoAtoms;
  }

  //  make edges
  nEAlloc = 3*nVertices;
  Edge    = new PCEdge[nEAlloc];
  for (i=0;i<nEAlloc;i++)
    Edge[i] = NULL;

  for (i=0;i<nVertices;i++)  {
    a1 = Vertex[i]->id;
    e1 = Vertex[i]->type;
    if (e1>nElementNames)  e1 = 6;
    e1--;
    for (j=i+1;j<nVertices;j++)  {
      a2 = Vertex[j]->id;
      e2 = Vertex[j]->type;
      if (e2>nElementNames)  e2 = 6;
      e2--;
      dx = R->atom[a2]->x - R->atom[a1]->x;
      dy = R->atom[a2]->y - R->atom[a1]->y;
      dz = R->atom[a2]->z - R->atom[a1]->z;
//      sr = CovalentRadius[e1] + CovalentRadius[e2] + 0.15;
      sr = CovalentRadius[e1] + CovalentRadius[e2] + 0.25;
      if (dx*dx+dy*dy+dz*dz<sr*sr)  {  // it's a bond
        G = new CEdge(i+1,j+1,1);
        AddEdge ( G );
      }
    }
    Vertex[i]->id = i+1;
  }
      
  if (aL)  delete[] aL;
  FreeVectorMemory ( occupancy,0 );

  nAllVertices = nVertices;
  nAllEdges    = nEdges;

  return rc;

}


void  CGraph::MakeVertexIDs()  {
int i;
  for (i=0;i<nAllVertices;i++)
    Vertex[i]->id = i+1;
}

void  CGraph::HideType ( int bond_vx_type )  {
//  1. Moves vertices bond_vx_type to the end of vertex array
//  2. Moves edges to bond_vx_type vertices to the end of edge array
//  3. Saves lengths of full vertex and edge arrays, and redefines
//     lengths to initial parts of the arrays not containing
//     bond_vx_type vertices.
PPCEdge   Edge1;
PPCVertex Vertex1;
int       i,k,v1,v2, nEdges1,nVertices1;
ivector   iv;

  Edge1   = new PCEdge[nEdges];
  Vertex1 = new PCVertex[nVertices];
  GetVectorMemory ( iv,nVertices,1 );

  for (i=0;i<nEdges;i++)
    if (Edge[i])  {
      v1 = Edge[i]->v1-1;
      v2 = Edge[i]->v2-1;
      if (Vertex[v1] && Vertex[v2])  {
        if ((Vertex[v1]->type & TYPE_MASK)==bond_vx_type)  {
          Vertex[v2]->AddBond();
          Vertex[v1]->CopyNBonds ( Vertex[v2] );
        }
        if ((Vertex[v2]->type & TYPE_MASK)==bond_vx_type)  {
          Vertex[v1]->AddBond();
          Vertex[v2]->CopyNBonds ( Vertex[v1] );
        }
      }
    }

  nVertices1 = 0;
  for (i=0;i<nVertices;i++)
    if (Vertex[i])  {
      if ((Vertex[i]->type & TYPE_MASK)!=bond_vx_type)  {
        Vertex1[nVertices1++] = Vertex[i];
        iv[i+1] = nVertices1;
      }
    }
  k = nVertices1;
  for (i=0;i<nVertices;i++)
    if (Vertex[i])  {
      if ((Vertex[i]->type & TYPE_MASK)==bond_vx_type)  {
        Vertex1[k++] = Vertex[i];
        iv[i+1] = k;
      }
    }

  nEdges1 = 0;
  for (i=0;i<nEdges;i++)
    if (Edge[i])  {
      Edge[i]->v1 = iv[Edge[i]->v1];
      Edge[i]->v2 = iv[Edge[i]->v2];
      if (((Vertex1[Edge[i]->v1-1]->type & TYPE_MASK)!=bond_vx_type) &&
          ((Vertex1[Edge[i]->v2-1]->type & TYPE_MASK)!=bond_vx_type))
        Edge1[nEdges1++] = Edge[i];
    }
  k = nEdges1;
  for (i=0;i<nEdges;i++)
    if (Edge[i])  {
      if (((Vertex1[Edge[i]->v1-1]->type & TYPE_MASK)==bond_vx_type) ||
          ((Vertex1[Edge[i]->v2-1]->type & TYPE_MASK)==bond_vx_type))
        Edge1[k++] = Edge[i];
    }

  nAllVertices = nVertices;
  nAllEdges    = nEdges;
  nVAlloc      = nVertices;
  nEAlloc      = nEdges;
  nVertices    = nVertices1;
  nEdges       = nEdges1;

  if (Vertex)  delete[] Vertex;
  if (Edge)    delete[] Edge;
  FreeVectorMemory ( iv,1 );

  Vertex = Vertex1;
  Edge   = Edge1;

}

void  CGraph::ExcludeType ( int type )  {
int     i,k;
ivector iv;
  GetVectorMemory ( iv,nAllVertices,1 );
  k = 0;
  for (i=0;i<nAllVertices;i++)
    if ((Vertex[i]->type & TYPE_MASK)!=type)  {
      if (k<i)  {
        Vertex[k] = Vertex[i];
        Vertex[i] = NULL;
      }
      k++;
      iv[i+1] = k;
    } else  {
      delete Vertex[i];
      Vertex[i] = NULL;
      iv[i+1]   = 0;
    }
  nAllVertices = k;
  nVertices = nAllVertices;
  k = 0;
  for (i=0;i<nAllEdges;i++)
    if ((iv[Edge[i]->v1]!=0) && (iv[Edge[i]->v2]!=0))  {
      if (k<i)  {
        Edge[k] = Edge[i];
        Edge[i] = NULL;
      }
      Edge[k]->v1 = iv[Edge[k]->v1];
      Edge[k]->v2 = iv[Edge[k]->v2];
      k++;
    } else  {
      delete Edge[i];
      Edge[i] = NULL;
    }
  nAllEdges = k;
  nEdges = nAllEdges;
  FreeVectorMemory ( iv,1 );
}

void CGraph::RemoveChirality()  {
int i;
  for (i=0;i<nAllVertices;i++)
    if (Vertex[i])  Vertex[i]->RemoveChirality();
}

void CGraph::LeaveChirality ( int eltype )  {
// leaves chirality for specified atom types
int i;
  for (i=0;i<nAllVertices;i++)
    if (Vertex[i])  Vertex[i]->LeaveChirality ( eltype );
}

void CGraph::MakeSymmetryRelief ( Boolean noCO2 )  {
//  This function looks for groups of equivalent vertices
// attached to a single vertice (e.g. chemical SO3 or
// PO3 groups), and re-lables them by adding a unique
// symmetry-relief number. This eliminates equivalent
// matches (3! for each SO3/PO3 group), and increases
// vertex diversity, which considerably speeds up matching.
// The function is cheap and harmless even if such groups
// of vertices are not found.
//  If noCO2 is True then CO2 symmetry is not releaved.
ivector v,vc;
int     i,j,k,n,m,almask,vjtype, ctype,otype;
Boolean noOxygens;

  GetVectorMemory ( v ,nVertices,0 );
  GetVectorMemory ( vc,nVertices,1 );

  for (i=1;i<=nVertices;i++)
    vc[i] = 0;

  for (j=0;j<nEdges;j++)  {
    if ((Edge[j]->v1>0) && (Edge[j]->v1<=nVertices))
      vc[Edge[j]->v1]++;
    if ((Edge[j]->v2>0) && (Edge[j]->v2<=nVertices))
      vc[Edge[j]->v2]++;
  }

  almask = ~ATOM_LEAVING;

  if (noCO2)  {
    ctype = getElementNo ( "C" );
    otype = getElementNo ( "O" );
  }

  noOxygens = False;

  for (i=1;i<=nVertices;i++)
    if (vc[i]>1)  {  // vertex at more than 1 edge
      // v[] will list connected vertices, k will be their number
      k = 0;
      for (j=0;j<nEdges;j++)  {
        if ((Edge[j]->v1==i) && (vc[Edge[j]->v2]==1) && (k<nVertices))
          v[k++] = Edge[j]->v2-1;
        if ((Edge[j]->v2==i) && (vc[Edge[j]->v1]==1) && (k<nVertices))
          v[k++] = Edge[j]->v1-1;
      }
      if (k>1)  {
        if (noCO2) noOxygens = ((Vertex[i-1]->type & almask)==ctype);
        // A group of vertices with single connection is
        // identified. Assign symmetry relief modifiers
        // to *equivalent* vertices in the group
        for (j=0;j<k;j++)
          if ((v[j]>=0) && (v[j]<nVertices))  {
            vjtype = Vertex[v[j]]->type & almask;
            if ((!noOxygens) || (vjtype!=otype))  {
              n = 1; // symmetry relief modifier
              for (m=j+1;m<k;m++)
                if ((v[m]>=0) && (v[m]<nVertices))  {
                  if (Vertex[v[j]]->type==
                      (Vertex[v[m]]->type & almask))  {
                    Vertex[v[m]]->type |= (n << 16);
                    n++;
                    v[m] = -1;
                  }
                }
            }
          }
      }
    }

  FreeVectorMemory ( v ,0 );
  FreeVectorMemory ( vc,1 );

}

int  CGraph::Build ( Boolean bondOrder )  {
int i,j, rc;

  if (nVertices<=0)  return 2;

  if (nGAlloc<nVertices)  {
    FreeMatrixMemory ( graph,nGAlloc,1,1 );
    nGAlloc = nVertices;
    GetMatrixMemory ( graph,nGAlloc,nGAlloc,1,1 );
  }

  for (i=1;i<=nVertices;i++)
    for (j=1;j<=nVertices;j++)
      graph[i][j] = 0;
  
  rc = 0;
  if (bondOrder)  {

    for (i=0;(i<nEdges) && (!rc);i++)
      if ((Edge[i]->v1>=1) && (Edge[i]->v1<=nVertices) &&
          (Edge[i]->v2>=1) && (Edge[i]->v2<=nVertices))  {
        graph[Edge[i]->v1][Edge[i]->v2] = Edge[i]->type;
        graph[Edge[i]->v2][Edge[i]->v1] = Edge[i]->type;
      } else
        rc = 1;

  } else  {

    for (i=0;i<nEdges;i++)
      if ((Edge[i]->v1>=1) && (Edge[i]->v1<=nVertices) &&
          (Edge[i]->v2>=1) && (Edge[i]->v2<=nVertices))  {
        graph[Edge[i]->v1][Edge[i]->v2] = 1;
        graph[Edge[i]->v2][Edge[i]->v1] = 1;
      } else
        rc = 1;

  }

  return rc;

}

void  CGraph::Print()  {
int i;

  printf ( " =====  Graph %s \n\n",name );

  if (nVertices>0) {
    printf ( "  Vertices:\n""  ##   " );
    Vertex[0]->Print(1);
    printf ( "\n" );
    for (i=0;i<nVertices;i++) {
      printf ( " %4i  ",i+1 );
      Vertex[i]->Print(0);
      printf ( "\n" );
    }
  }

  if (nEdges>0) {
    printf ( "  Edges:\n""  ##   " );
    Edge[0]->Print(1);
    printf ( "\n" );
    for (i=0;i<nEdges;i++) {
      printf ( " %4i  ",i+1 );
      Edge[i]->Print(0);
      printf ( "\n" );
    }
  }


}

void  CGraph::Print1()  {
int i,j;
  for (i=0;i<nVertices;i++)  {
    printf ( " %4i %5i %3i %7s ",
             i+1,Vertex[i]->id,Vertex[i]->type,Vertex[i]->name );
    for (j=0;j<nEdges;j++)
      if (Edge[j]->v1==i+1)
        printf ( " %4i(%i)",Edge[j]->v2,Edge[j]->type );
      else if (Edge[j]->v2==i+1)
        printf ( " %4i(%i)",Edge[j]->v1,Edge[j]->type );
    printf ( "\n" );
  }
}


void  CGraph::Copy ( PCGraph G )  {
int     i;

  FreeMemory();

  CreateCopy ( name,G->name );
  nVertices    = G->nVertices;
  nEdges       = G->nEdges;
  nAllVertices = G->nAllVertices;
  nAllEdges    = G->nAllEdges;
  if (nAllVertices>0)  {
    nVAlloc = nAllVertices;
    Vertex  = new PCVertex[nVAlloc];
    for (i=0;i<nAllVertices;i++)  {
      Vertex[i] = new CVertex();
      Vertex[i]->Copy ( G->Vertex[i] );
    }
  }
  if (nAllEdges>0)  {
    nEAlloc = nAllEdges;
    Edge    = new PCEdge[nEAlloc];
    for (i=0;i<nAllEdges;i++)  {
      Edge[i] = new CEdge();
      Edge[i]->Copy ( G->Edge[i] );
    }
  }

}

void  CGraph::write ( RCFile f )  {
int     i;
int     Version=2;
Boolean bondOrder=False;
  f.WriteInt    ( &Version      );
  f.WriteBool   ( &bondOrder    );
  f.CreateWrite ( name          );
  f.WriteInt    ( &nVertices    );
  f.WriteInt    ( &nEdges       );
  f.WriteInt    ( &nAllVertices );
  f.WriteInt    ( &nAllEdges    );
  for (i=0;i<nAllVertices;i++)
    StreamWrite ( f,Vertex[i] );
  for (i=0;i<nAllEdges;i++)
    StreamWrite ( f,Edge[i] );
}

void  CGraph::read ( RCFile f )  {
int     i,Version;
Boolean bondOrder;

  FreeMemory();

  f.ReadInt    ( &Version   );
  f.ReadBool   ( &bondOrder );
  f.CreateRead ( name       );
  f.ReadInt    ( &nVertices );
  f.ReadInt    ( &nEdges    );
  if (Version>1)  {
    f.ReadInt  ( &nAllVertices );
    f.ReadInt  ( &nAllEdges    );
  } else  {
    nAllVertices = nVertices;
    nAllEdges    = nEdges;
  }
  if (nAllVertices>0)  {
    nVAlloc = nAllVertices;
    Vertex  = new PCVertex[nVAlloc];
    for (i=0;i<nAllVertices;i++)  {
      Vertex[i] = NULL;
      StreamRead ( f,Vertex[i] );
    }
  }
  if (nAllEdges>0)  {
    nEAlloc = nAllEdges;
    Edge    = new PCEdge[nEAlloc];
    for (i=0;i<nAllEdges;i++)  {
      Edge[i] = NULL;
      StreamRead ( f,Edge[i] );
    }
  }

//  Build ( bondOrder );

}

void  CGraph::mem_write ( pstr S, int & l )  {
int     i,k;
Boolean bondOrder=False;

  ::mem_write ( bondOrder   ,S,l );
  ::mem_write ( name        ,S,l );
  ::mem_write ( nVertices   ,S,l );
  ::mem_write ( nEdges      ,S,l );
  ::mem_write ( nAllVertices,S,l );
  ::mem_write ( nAllEdges   ,S,l );
  for (i=0;i<nAllVertices;i++)
    if (Vertex[i])  {
      k = 1;
      ::mem_write ( k,S,l );
      Vertex[i]->mem_write ( S,l );
    } else  {
      k = 0;
      ::mem_write ( k,S,l );
    }
  for (i=0;i<nAllEdges;i++)
    if (Edge[i])  {
      k = 1;
      ::mem_write ( k,S,l );
      Edge[i]->mem_write ( S,l );
    } else  {
      k = 0;
      ::mem_write ( k,S,l );
    }
}

void  CGraph::mem_read ( cpstr S, int & l )  {
int     i,k;
Boolean bondOrder;

  FreeMemory();

  ::mem_read ( bondOrder   ,S,l );
  ::mem_read ( name        ,S,l );
  ::mem_read ( nVertices   ,S,l );
  ::mem_read ( nEdges      ,S,l );
  ::mem_read ( nAllVertices,S,l );
  ::mem_read ( nAllEdges   ,S,l );
  if (nAllVertices>0)  {
    nVAlloc = nAllVertices;
    Vertex  = new PCVertex[nVAlloc];
    for (i=0;i<nAllVertices;i++)  {
      ::mem_read ( k,S,l );
      if (k)  {
        Vertex[i] = new CVertex();
        Vertex[i]->mem_read ( S,l );
      } else
        Vertex[i] = NULL;
    }
  }
  if (nAllEdges>0)  {
    nEAlloc = nAllEdges;
    Edge    = new PCEdge[nEAlloc];
    for (i=0;i<nAllEdges;i++)  {
      ::mem_read ( k,S,l );
      if (k)  {
        Edge[i] = new CEdge();
        Edge[i]->mem_read ( S,l );
      } else  {
        Edge[i] = NULL;
      }
    }
  }

//  Build ( bondOrder );

}

MakeStreamFunctions(CGraph)


//  ==========================  CMatch  ============================

CMatch::CMatch() : CStream()  {
  InitMatch();
}

CMatch::CMatch ( RPCStream Object ) : CStream ( Object )  {
  InitMatch();
}

CMatch::CMatch ( ivector FV1, ivector FV2, int nv, int n, int m )  {
int i;
  if (FV1 && FV2)  {    
    n1     = n;
    n2     = m;
    nAlloc = n;
    GetVectorMemory ( F1,nAlloc,1 );
    GetVectorMemory ( F2,nAlloc,1 );
    mlength = nv;
    for (i=1;i<=mlength;i++)  {
      F1[i] = FV1[i];
      F2[i] = FV2[i];
    }
  } else
    InitMatch();
}

void  CMatch::InitMatch()  {
  mlength = 0;
  n1      = 0;
  n2      = 0;
  nAlloc  = 0;
  F1      = NULL;
  F2      = NULL;
}

CMatch::~CMatch()  {
  FreeVectorMemory ( F1,1 );
  FreeVectorMemory ( F2,1 );
}

void CMatch::SetMatch ( ivector FV1, ivector FV2, int nv, int n, int m )  {
int i;
  if (FV1 && FV2)  {
    if (nv>nAlloc)  {
      FreeVectorMemory ( F1,1 );
      FreeVectorMemory ( F2,1 );
      nAlloc = n;
      GetVectorMemory  ( F1,nAlloc,1 );
      GetVectorMemory  ( F2,nAlloc,1 );
    }
    n1 = n;
    n2 = m;
    mlength = nv;
    for (i=1;i<=mlength;i++)  {
      F1[i] = FV1[i];
      F2[i] = FV2[i];
    }
  } else  {
    FreeVectorMemory ( F1,1 );
    FreeVectorMemory ( F2,1 );
    mlength = 0;
    n1 = 0;
    n2 = 0;
  }
}


Boolean CMatch::isMatch ( ivector FV1, ivector FV2, int nv )  {
int     i,j;
Boolean B;
  if (FV1 && FV2 && (nv<=mlength))  {
    B = True;
    for (i=1;(i<=nv) && B;i++)  {
      B = False;
      for (j=1;(j<=mlength) && (!B);j++)
        B = (FV1[i]==F1[j]) && (FV2[i]==F2[j]);
    }
    return B;
  }
  return False;
}

Boolean CMatch::isCombination ( ivector FV1, ivector FV2, int nv )  {
int     i,j;
Boolean B;
  if (FV1 && FV2 && (nv==mlength))  {
    B = True;
    for (i=1;(i<=nv) && B;i++)  {
      B = False;
      for (j=1;(j<=mlength) && (!B);j++)
        B = (FV1[i]==F1[j]);
      if (B)  {
        B = False;
        for (j=1;(j<=mlength) && (!B);j++)
          B = (FV2[i]==F2[j]);
      }
    }
    return B;
  }
  return False;
}


void CMatch::GetMatch ( ivector  & FV1, ivector  & FV2, int & nv,
                        realtype & p1,  realtype & p2 )  {
  FV1 = F1;
  FV2 = F2;
  nv  = mlength;
  p1  = mlength;
  if (p1>0.0)  p1 /= n1;
  p2  = mlength;
  if (p2>0.0)  p2 /= n2;
}

void CMatch::write ( RCFile f )  {
int i;
int Version=1;
  f.WriteInt ( &Version );
  f.WriteInt ( &mlength );
  f.WriteInt ( &n1      );
  f.WriteInt ( &n2      );
  for (i=1;i<=mlength;i++)  {
    f.WriteInt ( &(F1[i]) );
    f.WriteInt ( &(F2[i]) );
  }
}

void CMatch::read ( RCFile f )  {
int i,Version;
  FreeVectorMemory ( F1,1 );
  FreeVectorMemory ( F2,1 );
  f.ReadInt ( &Version );
  f.ReadInt ( &mlength );
  f.ReadInt ( &n1      );
  f.ReadInt ( &n2      );
  if (mlength>0)  {
    nAlloc = n1;
    GetVectorMemory ( F1,nAlloc,1 );
    GetVectorMemory ( F2,nAlloc,1 );
    for (i=1;i<=mlength;i++)  {
      f.ReadInt ( &(F1[i]) );
      f.ReadInt ( &(F2[i]) );
    }
  }
}

void CMatch::mem_write ( pstr S, int & l )  {
int i;
  ::mem_write ( mlength,S,l );
  ::mem_write ( n1     ,S,l );
  ::mem_write ( n2     ,S,l );
  for (i=1;i<=mlength;i++)  {
    ::mem_write ( F1[i],S,l );
    ::mem_write ( F2[i],S,l );
  }
}

void CMatch::mem_read ( cpstr S, int & l )  {
int i;
  FreeVectorMemory ( F1,1 );
  FreeVectorMemory ( F2,1 );
  ::mem_read ( mlength,S,l );
  ::mem_read ( n1     ,S,l );
  ::mem_read ( n2     ,S,l );
  if (mlength>0)  {
    nAlloc = n1;
    GetVectorMemory ( F1,nAlloc,1 );
    GetVectorMemory ( F2,nAlloc,1 );
    for (i=1;i<=mlength;i++)  {
      ::mem_read ( F1[i],S,l );
      ::mem_read ( F2[i],S,l );
    }
  }
}


MakeStreamFunctions(CMatch)



//  ========================  CGraphMatch  ==========================

CGraphMatch::CGraphMatch()
           : CStream()  {
  InitGraphMatch();
}

CGraphMatch::CGraphMatch ( RPCStream Object )
           : CStream ( Object )  {
  InitGraphMatch();
}

CGraphMatch::~CGraphMatch()  {
  FreeMemory();
}

void  CGraphMatch::InitGraphMatch()  {
  G1           = NULL;
  G2           = NULL;
  n            = 0;
  m            = 0;
  P            = NULL;
  nAlloc       = 0;
  mAlloc       = 0;
  nMatches     = 0;
  maxNMatches  = -1;  // unlimited
  Match        = NULL;
  nMAlloc      = 0;
  flags        = 0;
  swap         = False;
  wasFullMatch = False;
  maxMatch     = 0;
  timeLimit    = 0;  // no time limit
  Stop         = False;
  stopOnMaxNMathches = False;
  F1           = NULL;
  F2           = NULL;
  iF1          = NULL;
  ix           = NULL;
#ifndef _UseRecursion
  jj           = NULL;
#endif
}


void  CGraphMatch::SetFlag ( word flag )  {
  flags |= flag;
}

void  CGraphMatch::RemoveFlag ( word flag )  {
  flags &= ~flag;
}

void  CGraphMatch::SetMaxNofMatches ( int maxNofMatches,
                                      Boolean stopOnMaxN )  {
  maxNMatches        = maxNofMatches;
  stopOnMaxNMathches = stopOnMaxN;
}

void  CGraphMatch::SetTimeLimit ( int maxTimeToRun )  {
  timeLimit = maxTimeToRun;
}

void  CGraphMatch::FreeMemory()  {
int i;

  if (P) {
    FreeMatrixMemory ( P[1],nAlloc,1,0 );
    FreeRecHeap      ();
    P = P + 1;
    delete[] P;
    P = NULL;
  }

  FreeMatrixMemory ( iF1,nAlloc,1,1 );

  FreeVectorMemory ( F1 ,1 );
  FreeVectorMemory ( F2 ,1 );
  FreeVectorMemory ( ix ,1 );
  nAlloc = 0;
  mAlloc = 0;

  if (Match)  {
    for (i=0;i<nMAlloc;i++)
      if (Match[i])  delete Match[i];
    delete[] Match;
  }
  Match    = NULL;
  nMatches = 0;
  nMAlloc  = 0;

#ifndef _UseRecursion
  FreeVectorMemory ( jj,1 );
#endif

}

void  CGraphMatch::FreeRecHeap()  {
int i;
  if (P)
    for (i=2;i<=nAlloc;i++)
      FreeMatrixMemory ( P[i],nAlloc,1,0 );
}


void  CGraphMatch::GetMemory()  {
int i;

  FreeMemory();

  P = new imatrix[n];
  P = P-1;
  GetMatrixMemory ( P[1],n,m+1,1,0 );
  for (i=2;i<=n;i++)
    P[i] = NULL;

  GetMatrixMemory ( iF1,n,n,1,1 );

  GetVectorMemory ( F1,n,1 );
  GetVectorMemory ( F2,n,1 );
  GetVectorMemory ( ix,n,1 );

#ifndef _UseRecursion
  GetVectorMemory ( jj,n,1 );
#endif

  nAlloc = n;
  mAlloc = m;

}

void  CGraphMatch::GetRecHeap()  {
int i,j;
  for (i=2;i<=n;i++)  {
    P[i] = new ivector[nAlloc];
    P[i] = P[i]-1;
    for (j=1;j<=n;j++)
      GetVectorMemory ( P[i][j],P[1][j][0]+1,0 );
    for (j=n+1;j<=nAlloc;j++)
      P[i][j] = NULL;
  }
}

void  CGraphMatch::MatchGraphs ( PCGraph Gh1, PCGraph Gh2,
                                 int     minMatch,
                                 Boolean vertexType )  {
int  n1;

  if (Gh1->nVertices<=Gh2->nVertices)  {
    G1   = Gh1; 
    G2   = Gh2;
    swap = False;
  } else  {
    G1   = Gh2;
    G2   = Gh1;
    swap = True;
  }
  n  = G1->nVertices;
  m  = G2->nVertices;
  V1 = G1->Vertex;
  V2 = G2->Vertex;
  c1 = G1->graph;
  c2 = G2->graph;

  nMatches = 0;

  if (n<=0)  return;

  if ((n>nAlloc) || (m>mAlloc))  GetMemory();
                           else  FreeRecHeap();

  n1 = Initialize ( vertexType );
  if (n1<=0)  return;

  GetRecHeap();

  maxMatch  = IMax(1,IMin(n,minMatch));
  Stop      = False;
  startTime = time(NULL);

  //    Use of Backtrack(..) and Ullman() is completely
  //  equivalent. One of them should be commented.

  if (minMatch<n)  {

    if (n1>=minMatch)  Backtrack1 ( 1,n1 );

  } else if (n1>=n)  {

   #ifdef _UseRecursion
    Backtrack ( 1 );
   #else
    Ullman();
   #endif

  }

}


int  CGraphMatch::Initialize ( Boolean vertexType )  {
ivector jF1;
int     i,j,v1type,almask,iW,pl;

  wasFullMatch = False;

  jF1 = iF1[1];
  for (i=1;i<=n;i++)
    jF1[i] = i;

  almask = ~ATOM_LEAVING;

/*  -- experiment for symmetry reliefs
int v2type,v1type_sr,srmask;
  srmask = ~SYMREL_MASK;

  for (i=1;i<=n;i++)  {
    if (vertexType) {
      ix[i]  = 0;
      v1type = V1[i-1]->type & almask;
      v1type_sr = v1type & srmask;
      pl     = 0;
      for (j=1;j<=m;j++)  {
        v2type = V2[j-1]->type & almask;
        if ((v1type==v2type) ||
            (v1type_sr==v2type) ||
            (v1type==(v2type & srmask)))
          P[1][i][++pl] = j;
      }
      P[1][i][0] = pl;
      if (pl)  ix[i] = i;
    } else {
      ix[i] = i;
      for (j=1;j<=m;j++)
        P[1][i][j] = j;
      P[1][i][0] = m;
    }
    F1[i] = 0;
    F2[i] = 0;
  }
 */

  for (i=1;i<=n;i++)  {
    if (vertexType) {
      ix[i]  = 0;
      v1type = V1[i-1]->type & almask;
      pl     = 0;
      for (j=1;j<=m;j++)
        if (v1type==(V2[j-1]->type & almask))
          P[1][i][++pl] = j;
      P[1][i][0] = pl;
      if (pl)  ix[i] = i;
    } else {
      ix[i] = i;
      for (j=1;j<=m;j++)
        P[1][i][j] = j;
      P[1][i][0] = m;
    }
    F1[i] = 0;
    F2[i] = 0;
  }

  i = 1;
  j = n;
  while (i<j)
    if (ix[j]==0)  // make sure that j points on a true-containing
      j--;         // row of P[1]
    else  {
      if (ix[i]==0)  {        // swap lower empty row of P[1]
        iW     = ix[i];       // with the lth one, which
        ix[i]  = ix[j];       // is surely not empty
        ix[j]  = iW;
        iW     = jF1[i];
        jF1[i] = jF1[j];
        jF1[j] = iW;
      }
      i++;
    }

  if (ix[i]==0)  return i-1;
           else  return i;

}


#ifdef _UseRecursion

void  CGraphMatch::Backtrack ( int i )  {
//   Recursive version of Ullman's algorithm for exact
// (structure-to-structure or substructure-to-structure)
// matching
int     i1,pli,cntj,j,k,pl1,pl2,cntl,l,c1ik;
ivector c1i,c2j;
ivector p1,p2;

  if (Stop)  return;
  if (timeLimit>0)
    Stop = (difftime(time(NULL),startTime)>timeLimit);

  F1[i] = i;
  pli   = P[i][i][0];

  if (i>=n)  {

    for (cntj=1;(cntj<=pli) && (!Stop);cntj++)  {
      F2[n] = P[n][n][cntj];
      CollectMatch ( n );
    }

  } else  {

    i1  = i+1;
    c1i = c1[i];

    for (cntj=1;(cntj<=pli) && (!Stop);cntj++)  {
      j     = P[i][i][cntj];
      F2[i] = j;  // mapped F1[i]:F2[i], i.e. i:j
      // Forward checking
      c2j   = c2[j];
      pl2   = 1;
      for (k=i1;(k<=n) && (pl2>0);k++)  {
        p1   = P[i][k];
        p2   = P[i1][k];
        c1ik = c1i[k];
        pl1  = p1[0];
        pl2  = 0;
        for (cntl=1;cntl<=pl1;cntl++)  {
          l = p1[cntl];
          if ((c1ik==c2j[l]) && // check that bonds are compatible
              (l!=j))           // and make sure jth vertex is excluded
            p2[++pl2] = l;
        }
        p2[0] = pl2;  //  new length of P-row
      }
      if (pl2>0)  Backtrack ( i1 );
    }

  }

}

#else

void  CGraphMatch::Ullman()  {
//   A non-recursive translation of Ullman's Backtrack.
// It might give some gain in performance, although tests
// on SGI machine show that the gain is negligible, (if
// there is any at all) if compiler's optimization is
// switched on.
int     i,pl,i1,pli,cntj,j,pl1,pl2,k,cntl,l,l1,cik;
ivector ci,cj;
ivector p1,p2;

  if (Stop)  return;
  if (timeLimit>0)
    Stop = (difftime(time(NULL),startTime)>timeLimit);

  i     = 1;
  jj[1] = 1;
  pl    = P[1][1][0];

  do  {

    F1[i] = i;
    pli   = P[i][i][0];

    if (i>=n)  {

      for (cntj=jj[n];(cntj<=pli) && (!Stop);cntj++)  {
        jj[n]++;
        F2[n] = P[n][n][cntj];
        CollectMatch ( n );
      }

    } else  {

      i1  = i+1;
      ci  = c1[i];
      for (cntj=jj[i];(cntj<=pli) && (!Stop);cntj++)  {
        jj[i]++;
        j     = P[i][i][cntj];
        F2[i] = j;
        // Forward checking
        cj    = c2[j];
        pl2   = 1;
        for (k=i1;(k<=n) && (pl2>0);k++)  {
          p1  = P[i][k];
          p2  = P[i1][k];
          cik = ci[k];
          pl1 = p1[0];
          pl2 = 0;
          for (cntl=1;cntl<=pl1;cntl++)  {
            l = p1[cntl];
            if ((cik==cj[l]) && // check that bonds are compatible
                (l!=j))         // and make sure jth vertex is excluded
              p2[++pl2] = l;
          }
          p2[0] = pl2;  //  new length of P-row
        }
        if (pl2>0)  {
          i++;
          jj[i] = 1;
          i++;        // in order to compensate the following decrement
          break;
        }
      }

    }
    i--;

  } while ((!Stop) && ((jj[1]<=pl) || (i>1)));

}

#endif

void  CGraphMatch::Backtrack1 ( int i, int k0 )  {
//   Recursive version of CSIA algorithm for partial
// (substructure-to-substructure) matching
int     i1,pl0,cntj,j,k,pl1,pl2,cntl,l,c1ik,ii,iW,k1;
ivector jF1,c1i,c2j;
ivector p0,p1,p2;

  if (Stop)  return;
  if (timeLimit>0)
    Stop = (difftime(time(NULL),startTime)>timeLimit);

  jF1 = iF1[i];

  if (i>=k0)  {

    F1[i] = jF1[i];
    p0    = P[i][jF1[i]];
    pl0   = p0[0];

    // collect matches of k0-th (the upmost) level
    if (pl0>0)  {
      maxMatch = k0;
      for (cntj=1;cntj<=pl0;cntj++)  {
        F2[k0] = p0[cntj];
        CollectMatch ( k0 );
      }
    }

  } else  {

    i1  = i+1;

    pl0 = P[i][jF1[i]][0];
    j   = i;
    for (k=i1;k<=k0;k++)
      if (P[i][jF1[k]][0]<pl0)  {
        pl0 = P[i][jF1[k]][0];
        j   = k;
      }
    if (j>i)  {
      iW     = jF1[i];
      jF1[i] = jF1[j];
      jF1[j] = iW;
    }

    F1[i] = jF1[i];
    p0    = P[i][jF1[i]];
    pl0   = p0[0];

    c1i   = c1[jF1[i]];

    //  1. Find all matches that include jF1[i]th vertex of graph G1

    for (cntj=1;(cntj<=pl0) && (!Stop);cntj++)  {
      j = p0[cntj];
      F2[i] = j;   // mapped F1[i]:F2[i], i.e. iF1[i][i]:j
      // Forward checking
      c2j = c2[j];
      k1  = k0;   // k1 is the limit for match size
      for (k=i1;(k<=k0) && (k1>=maxMatch);k++)  {
        ix[k] = 0;
        p1    = P[i] [jF1[k]];
        p2    = P[i1][jF1[k]];
        c1ik  = c1i  [jF1[k]];
        pl1   = p1[0];
        pl2   = 0;
        for (cntl=1;cntl<=pl1;cntl++)  {
          l = p1[cntl];
          if ((c1ik==c2j[l]) && // check that bonds are compatible
              (l!=j))           // and make sure jth vertex is excluded
            p2[++pl2] = l;
        }
        p2[0] = pl2;  //  new length of P-row
        if (pl2>0)  {
          ix[k] = k;
        } else if (wasFullMatch)  {
          k1 = maxMatch-1;  // we are not interested in partial
        } else  {           //   match anymore
          k1--;
        }
      }
      if (k1>=maxMatch)  {
        // shift unmatching vertices to the end
        for (ii=1;ii<=n;ii++)
          iF1[i1][ii] = jF1[ii];
        k = i1;
        l = k0;
        while (k<l)
          if (ix[l]==0) // make sure that l points on a true-containing
            l--;        // row of P[i1]
          else  {
            if (ix[k]==0)  {         // swap lower empty row of P[i1]
              iW         = ix[k];    // with the lth one, which
              ix[k]      = ix[l];    // is surely not empty
              ix[l]      = iW;
              iW         = iF1[i1][k];
              iF1[i1][k] = iF1[i1][l];
              iF1[i1][l] = iW;
            }
            k++;
          }
        if (ix[i1])  Backtrack1 ( i1,k1 );
        else if (i>=maxMatch)  {
          CollectMatch ( i );  // collect match of ith level
          maxMatch = i;
        }
      }
    }

    //  2. Find all matches that do not include jF1[i]th vertex
    //     of graph G1

    if (k0>maxMatch)  {
      //   Shift jF1[i]th vertex to the end
      iW      = jF1[i];
      jF1[i]  = jF1[k0];
      jF1[k0] = iW;
      Backtrack1 ( i,k0-1 );
    }

  }

}


void  CGraphMatch::CollectMatch ( int nm )  {
int      i;
Boolean  B;
PPCMatch M1;

  if (maxNMatches==0)  return;

  // find out if this should be a new match
  if (nMatches>0)  {
    // a match is already found; check with it
    if (nm<Match[0]->mlength)  return;
    if (nm>Match[0]->mlength)  {
      nMatches = 0;
    } else if (flags & GMF_UniqueMatch)  {
      // check if such a match was already found
      B = False;
      for (i=0;(i<nMatches) && (!B);i++)
        B = Match[i]->isMatch(F1,F2,nm);
      if (B)  return;  // repeating match -- just quit.
    } else if (flags & GMF_NoCombinations)  {
      // check if such a match was already found
      B = False;
      for (i=0;(i<nMatches) && (!B);i++)
        B = Match[i]->isCombination(F1,F2,nm);
      if (B)  return;  // repeating match -- just quit.
    }
  }

  if (nMatches>=nMAlloc)  {
    if ((nMAlloc<maxNMatches) || (maxNMatches<=0))  {
      if (maxNMatches>0)  nMAlloc  = IMin(maxNMatches,nMAlloc+100);
                    else  nMAlloc += 100;
      M1 = new PCMatch[nMAlloc];
      for (i=0;i<nMatches;i++)
        M1[i] = Match[i];
      for (i=nMatches;i<nMAlloc;i++)
        M1[i] = NULL;
      if (Match)  delete[] Match;
      Match = M1;
    } else
      nMatches--;
  }

  if (!Match[nMatches])
        Match[nMatches] = new CMatch ( F1,F2,nm,n,m );
  else  Match[nMatches]->SetMatch ( F1,F2,nm,n,m );

  if (nm==n)  wasFullMatch = True;
 
  if (nm>maxMatch)  maxMatch = nm;

  nMatches++;

  if (stopOnMaxNMathches && (maxNMatches>0) &&
      (nMatches>=maxNMatches))
    Stop = True;

}

void  CGraphMatch::PrintMatches()  {
int i,j,k;
  if (nMatches<=0)
    printf ( "\n\n *** NO MATCHES FOUND\n\n" );
  else  {
    if (flags & GMF_UniqueMatch)
          printf ( "\n\n *** FOUND Unique Matches\n\n" );
    else  printf ( "\n\n *** FOUND Matches\n\n" );
    printf ( "    ##     Vertices\n" );
    for (i=0;i<nMatches;i++)  {
      printf ( " %5i  ",i+1 );
      k = 8;
      for (j=1;j<=Match[i]->mlength;j++)  {
        if (swap)
             printf ( " (%i,%i)",Match[i]->F2[j],Match[i]->F1[j] );
        else printf ( " (%i,%i)",Match[i]->F1[j],Match[i]->F2[j] );
        k += 8;
        if (k>70)  {
          printf ( "\n" );
          k = 8;
        }
      }
      printf ( "\n" );
    }
  }
  printf ( "\n **************************\n" );
}

void  CGraphMatch::GetMatch ( int MatchNo, ivector  & FV1,
                              ivector  & FV2, int & nv,
                              realtype & p1, realtype & p2 ) {
// do not allocate or dispose FV1 and FV2 in application!
// FV1/p1 will always correspond to Gh1, and FV2/p2 -
// to Gh2 as specified in MatchGraphs(..)
  if ((MatchNo<0) || (MatchNo>=nMatches))  {
    FV1 = NULL;
    FV2 = NULL;
    nv  = 0;
    p1  = 0.0;
    p2  = 0.0;
  } else if (swap)
       Match[MatchNo]->GetMatch ( FV2,FV1,nv,p2,p1 );
  else Match[MatchNo]->GetMatch ( FV1,FV2,nv,p1,p2 );

}


void  CGraphMatch::write ( RCFile f )  {
int i;
int Version=1;
  f.WriteInt  ( &Version  );
  f.WriteInt  ( &nMatches );
  f.WriteWord ( &flags    );
  f.WriteBool ( &swap     );
  for (i=0;i<nMatches;i++)
    Match[i]->write ( f );
}

void  CGraphMatch::read ( RCFile f )  {
int i,Version;
  FreeMemory ();
  f.ReadInt  ( &Version  );
  f.ReadInt  ( &nMatches );
  f.ReadWord ( &flags    );
  f.ReadBool ( &swap     );
  if (nMatches>0)  {
    nMAlloc = nMatches;
    Match   = new PCMatch[nMatches];
    for (i=0;i<nMatches;i++)  {
      Match[i] = new CMatch();
      Match[i]->read ( f );
    }
  }
}


void  CGraphMatch::mem_write ( pstr S, int & l )  {
int i;
  ::mem_write ( nMatches,S,l );
  ::mem_write ( flags   ,S,l );
  ::mem_write ( swap    ,S,l );
  for (i=0;i<nMatches;i++)
    Match[i]->mem_write ( S,l );
}

void  CGraphMatch::mem_read ( cpstr S, int & l )  {
int i;
  FreeMemory ();
  ::mem_read ( nMatches,S,l );
  ::mem_read ( flags   ,S,l );
  ::mem_read ( swap    ,S,l );
  if (nMatches>0)  {
    nMAlloc = nMatches;
    Match   = new PCMatch[nMatches];
    for (i=0;i<nMatches;i++)  {
      Match[i] = new CMatch();
      Match[i]->mem_read ( S,l );
    }
  }
}

MakeStreamFunctions(CGraphMatch)



// =============================================================

/*
static char Mol1[][3] = {
  "C", "C", "C", "C", "C", "C" };

static int  Bond1[] = {
  1, 2,
  1, 6,
  2, 3,
  3, 4,
  4, 5,
  5, 6
};

static char Mol2[][3] = {
  "C", "C", "C", "C", "C", "C",
  "C", "C", "C", "C", "C", "C" };

static int  Bond2[] = {
  1, 2,
  1, 6,
  2, 3,
  3, 4,
  4, 5,
  5, 6,
  1, 7,
  2, 8,
  3, 9,
  4, 10,
  5, 11,
  6, 12
};


static char Mol1[][3] = {
  "C", "C", "N", "C" };

static int  Bond1[] = {
  1, 2,
  2, 3,
  3, 4
};

static char Mol2[][3] = {
  "C", "C", "N", "C" };

static int  Bond2[] = {
  1, 2,
  2, 3,
  2, 4,
  3, 4
};

void  TestGraphMatch()  {
int         i,k1,k2, nv1,nb1, nv2,nb2;
PCVertex    V;
PCEdge      G;
CGraph      G1,G2;
CGraphMatch U;

  G1.Reset   ();
  G1.SetName ( "#1" );

  nv1 = sizeof(Mol1)/3;
  for (i=0;i<nv1;i++)  {
    V = new CVertex();
    V->SetVertex ( Mol1[i] );
    G1.AddVertex ( V );
  }
  nb1 = sizeof(Bond1)/(2*sizeof(int));
  k1  = 0;
  k2  = 1;
  for (i=0;i<nb1;i++)  {
    G = new CEdge();
    G->SetEdge ( Bond1[k1],Bond1[k2],1 );
    G1.AddEdge ( G );
    k1 += 2;
    k2 += 2;
  }

  G2.Reset   ();
  G2.SetName ( "#2" );

  nv2 = sizeof(Mol2)/3;
  for (i=0;i<nv2;i++)  {
    V = new CVertex();
    V->SetVertex ( Mol2[i] );
    G2.AddVertex ( V );
  }
  nb2 = sizeof(Bond2)/(2*sizeof(int));
  k1  = 0;
  k2  = 1;
  for (i=0;i<nb2;i++)  {
    G = new CEdge();
    G->SetEdge ( Bond2[k1],Bond2[k2],1 );
    G2.AddEdge ( G );
    k1 += 2;
    k2 += 2;
  }

  G1.Build();
  G2.Build();

  U.MatchGraphs ( &G1,&G2,nv1 );

  U.PrintMatches();


}
*/

