//  $Id: mmdb_xml.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_XML <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CXMLObject
//       ~~~~~~~~~
//
//   (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_XML__
#define __MMDB_XML__


#ifndef __MMDB_MMCIF__
#include "mmdb_mmcif.h"
#endif



//  ======================  CXMLObject  ==========================

#define XMLR_Ok           0
#define XMLR_NoFile       1
#define XMLR_NoTag        2
#define XMLR_BrokenTag    3
#define XMLR_UnclosedTag  4

DefineClass(CXMLObject)
DefineStreamFunctions(CXMLObject)

class CXMLObject : public CStream  {

  public :

    CXMLObject ();
    CXMLObject ( cpstr Tag );
    CXMLObject ( cpstr Tag, cpstr Data );
    CXMLObject ( cpstr Tag, realtype V, int length=11 );
    CXMLObject ( cpstr Tag, int     iV, int length=0  );
    CXMLObject ( cpstr Tag, Boolean bV );
    CXMLObject ( cpstr Tag, PCXMLObject XMLObject );
    CXMLObject ( RPCStream Object );
    ~CXMLObject();

    void  SetTag  ( cpstr Tag  );
    void  SetData ( cpstr Data );
    void  AddData ( cpstr Data );
    void  SetData ( realtype V, int length=11 );
    void  SetData ( int     iV, int length=0  );
    void  SetData ( Boolean bV );

    int   AddMMCIFCategory ( PCMMCIFCategory mmCIFCat    );
    int   AddMMCIFStruct   ( PCMMCIFStruct   mmCIFStruct );
    int   AddMMCIFLoop     ( PCMMCIFLoop     mmCIFLoop   );
    int   AddMMCIFData     ( PCMMCIFData     mmCIFData   );

    pstr  GetTag  () { return objTag; }

    //   Here and below the functions allow for "tag1>tag2>tag3>..."
    // as a composite multi-level tag, e.g. the above may stand for
    // <tag1><tag2><tag3>data</tag3></tag2></tag1>. NULL tag
    // corresponds to "this" object.
    //   objNo counts same-tag objects of the *highest* level used
    // (e.g. level tag3 for composite tag  tag1>tag2>tag3 ).
    //   GetData ( pstr& ... ) only copies a pointer to data.
    pstr  GetData ( cpstr Tag=NULL, int objNo=1 );
    int   GetData ( pstr   & Data, cpstr Tag=NULL, int objNo=1 );
    int   GetData ( realtype &  V, cpstr Tag=NULL, int objNo=1 );
    int   GetData ( int      & iV, cpstr Tag=NULL, int objNo=1 );
    int   GetData ( Boolean  & bV, cpstr Tag=NULL, int objNo=1 );

    PCXMLObject GetObject ( cpstr Tag, int objNo=1 );

    void  AddObject   ( PCXMLObject XMLObject, int lenInc=10 );
    int   WriteObject ( cpstr FName, int pos=0, int ident=2   );
    void  WriteObject ( RCFile f, int pos=0, int ident=2   );
    int   ReadObject  ( cpstr FName );
    int   ReadObject  ( RCFile f, pstr S, int & pos, int slen );

    virtual void Copy ( PCXMLObject XMLObject );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected:
    pstr         objTag;
    pstr         objData;
    int          nObjects,nAlloc;
    PPCXMLObject object;

    void         InitXMLObject();
    virtual void FreeMemory   ();

};


extern  PCXMLObject mmCIF2XML ( PCMMCIFData mmCIFData, int * rc=NULL );
extern  PCXMLObject mmCIF2XML ( cpstr XMLName, PCMMCIFFile mmCIFFile,
                                                       int * rc=NULL );

#endif


