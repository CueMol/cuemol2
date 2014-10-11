//  $Id: stream_.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    12.12.00   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :  CStream_ <interface>
//       ~~~~~~~~~
//  **** Classes :  CStream ( Basic Stream Class )
//       ~~~~~~~~~
//
//   (C) E. Krissinel 1995-2008
//
//  =================================================================
//

#ifndef __Stream__
#define __Stream__

#ifndef  __File__
#include "file_.h"
#endif

//  *******************************************************************

#ifndef __ClassMacros

# define __ClassMacros

 //  A Class definition macros
# define DefineClass(ClassName)             \
   class ClassName;                         \
   typedef ClassName    * P##ClassName;     \
   typedef ClassName    & R##ClassName;     \
   typedef P##ClassName * PP##ClassName;    \
   typedef P##ClassName & RP##ClassName;

 //  A Structure definition macros
# define DefineStructure(StructureName)             \
   struct StructureName;                            \
   typedef StructureName    * P##StructureName;     \
   typedef StructureName    & R##StructureName;     \
   typedef P##StructureName * PP##StructureName;    \
   typedef P##StructureName & RP##StructureName;

#endif


#define  DefineStreamFunctions(ClassName)                      \
  extern void StreamWrite ( RCFile f, RP##ClassName Object );  \
  extern void StreamRead  ( RCFile f, RP##ClassName Object );


#define  MakeStreamFunctions(ClassName)                        \
  void StreamWrite ( RCFile f, RP##ClassName Object )  {       \
    StreamWrite_ ( f,(RPCStream)Object );                      \
  }                                                            \
  PCStream StreamInit##ClassName ( RPCStream Object )  {       \
    return (PCStream)(new ClassName(Object));                  \
  }                                                            \
  void StreamRead ( RCFile f, RP##ClassName Object )  {        \
    StreamRead_ ( f,(RPCStream)Object,StreamInit##ClassName ); \
  }



#define  DefineFactoryFunctions(ClassName)                              \
  typedef P##ClassName      Make##ClassName();                          \
  typedef Make##ClassName * PMake##ClassName;                           \
  typedef P##ClassName      StreamMake##ClassName ( RPCStream Object ); \
  P##ClassName  new##ClassName ();                                      \
  P##ClassName  streamNew##ClassName ( RPCStream Object );              \
  typedef StreamMake##ClassName * PStreamMake##ClassName;               \
  extern void SetMakers##ClassName ( void * defMk, void * streamMk );   \
  extern void StreamWrite ( RCFile f, RP##ClassName Object );           \
  extern void StreamRead  ( RCFile f, RP##ClassName Object );


#define  MakeFactoryFunctions(ClassName)                         \
  static PMake##ClassName       make##ClassName       = NULL;    \
  static PStreamMake##ClassName streamMake##ClassName = NULL;    \
  P##ClassName new##ClassName()  {                               \
    if (make##ClassName)  return (*make##ClassName)();           \
                    else  return new ClassName();                \
  }                                                              \
  P##ClassName streamNew##ClassName ( RPCStream Object )  {      \
    if (streamMake##ClassName)                                   \
          return (*streamMake##ClassName)(Object);               \
    else  return new ClassName(Object);                          \
  }                                                              \
  void SetMakers##ClassName ( void * defMk, void * streamMk ) {  \
    make##ClassName       = PMake##ClassName(defMk);             \
    streamMake##ClassName = PStreamMake##ClassName(streamMk);    \
  }                                                              \
  void StreamWrite ( RCFile f, RP##ClassName Object )  {         \
    StreamWrite_ ( f,(RPCStream)Object );                        \
  }                                                              \
  PCStream StreamInit##ClassName ( RPCStream Object )  {         \
    return (PCStream)(streamNew##ClassName(Object));             \
  }                                                              \
  void StreamRead ( RCFile f, RP##ClassName Object )  {          \
    StreamRead_ ( f,(RPCStream)Object,StreamInit##ClassName );   \
  }




//  ==========================  CStream  ===========================

//     Each streamable class should be derived from CStream
//  and have constructor CClass(PCStream & Object), which should
//  initialize all memory of the class, and virtual functions
//  read(..) and write(..) (see below). Constructor CClass(PCStream&)
//  must not touch the Object variable. This constructor is used
//  only once just before the read(..) function. It is assumed that
//  read(..)/write(..) functions of the CClass provide storage/reading
//  of  all vital data. Function read(..) must read data in exactly
//  the same way as function write(..) stores it.
//     For using CClass in streams, three following functions should
//  be supplied:
//
//     1.
//     void StreamWrite ( CFile & f, PCClass & Object )  {
//       StreamWrite ( f,(PCStream)Object );
//     }
//
//     2.
//     PCStream CClassInit ( PCStream & Object )  {
//       return (PCStream)(new CClass(Object));
//     }
//
//     3.
//     void StreamRead ( CFile & f, PCClass & Object )  {
//       StreamRead_ ( f,(PCStream)Object,CClassInit );
//     }
//
//    All these functions are automatically generated by macros
//  DefineStreamFunctions(CClass) -- in the header -- and
//  MakeStreamFunctions(CClass) -- in the implementation body. Note
//  that macro DefineClass(CClass) should always be issued for
//  streamable classes prior to the stream-making macros. Then
//  CClass may be streamed using functions #1 and #3.
//    StreamRead will return NULL for Object if it was not in
//  the stream. If Object existed before calling StreamRead(..)
//  but was not found in the stream, it will be disposed (NULL
//  assigned).


DefineClass(CStream)
DefineStreamFunctions(CStream)

class CStream  {
  public :
    CStream            ()                   {}
    CStream            ( RPCStream Object ) {}
    virtual ~CStream   ()                   {}
    virtual void read  ( RCFile f )         {}
    virtual void write ( RCFile f )         {}
};


typedef PCStream InitStreamObject(RPCStream Object);

extern  void StreamRead_  ( RCFile f, RPCStream Object,
                                      InitStreamObject Init );

extern  void StreamWrite_ ( RCFile f, RPCStream Object );


#endif
