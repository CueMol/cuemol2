//  $Id: mmdb_bondmngr.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    12.01.01   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  mmdb_bondmngr  <implementation>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMDBBondManager ( MMDB bonds maker )
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//


#ifndef  __STRING_H
#include <string.h>
#endif

#ifndef  __MMDB_BondMngr__
#include "mmdb_bondmngr.h"
#endif

#ifndef  __MMDB_Graph__
#include "mmdb_graph.h"
#endif


//  =====================   CMMDBBondManager   =====================

CMMDBBondManager::CMMDBBondManager() : CMMDBSelManager()  {
}

CMMDBBondManager::CMMDBBondManager ( RPCStream Object )
                : CMMDBSelManager(Object)  {
}

CMMDBBondManager::~CMMDBBondManager()  {}

void  CMMDBBondManager::MakeBonds ( Boolean calc_only )  {
PCModel   model;
PCChain   chain;
PCResidue res;
CGraph    graph;
PPCVertex V;
PPCEdge   E;
int       i, im,ic,ir, nV,nE, k1,k2;

  RemoveBonds();

  for (im=0;im<nModels;im++)  {
    model = Model[im];
    if (model)
      for (ic=0;ic<model->nChains;ic++)  {
        chain = model->Chain[ic];
        if (chain)
          for (ir=0;ir<chain->nResidues;ir++)  {
            res = chain->Residue[ir];
            if (res)  {
              graph.MakeGraph   ( res,NULL );
              graph.GetVertices ( V,nV );
              graph.GetEdges    ( E,nE );
              for (i=0;i<nE;i++)  {
                k1 = V[E[i]->GetVertex1()]->GetUserID();
                k2 = V[E[i]->GetVertex2()]->GetUserID();
                res->atom[k1]->AddBond ( res->atom[k2],E[i]->GetType() );
                res->atom[k2]->AddBond ( res->atom[k1],E[i]->GetType() );
              }
            }
          }
      }
  }

}

void  CMMDBBondManager::RemoveBonds()  {
int i;
  for (i=0;i<nAtoms;i++)
    if (Atom[i])
      Atom[i]->FreeBonds();
}

//  -------------------  Stream functions  ----------------------

void  CMMDBBondManager::write ( RCFile f )  {
byte Version=1;
  f.WriteByte ( &Version );
  CMMDBSelManager::write ( f );
}

void  CMMDBBondManager::read ( RCFile f )  {
byte Version;
  f.ReadByte ( &Version );
  CMMDBSelManager::read ( f );
}


MakeStreamFunctions(CMMDBBondManager)
