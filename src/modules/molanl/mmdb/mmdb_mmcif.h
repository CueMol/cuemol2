//  $Id: mmdb_mmcif.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_MMCIF <interface>
//       ~~~~~~~~~
//  **** Project :  MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//  **** Classes :  CMMCIFCategory ( mmCIF category    )
//       ~~~~~~~~~  CMMCIFStruct   ( mmCIF structure   )
//                  CMMCIFLoop     ( mmCIF loop        )
//                  CMMCIFData     ( mmCIF data block  )
//                  CMMCIFFile     ( mmCIF file        )
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_MMCIF__
#define __MMDB_MMCIF__


#ifndef __Stream__
#include "stream_.h"
#endif



//  ======================  CMMCIFCategory  ==========================

#define MMCIF_Category 0
#define MMCIF_Struct   1
#define MMCIF_Loop     2
#define MMCIF_Data     3

DefineClass(CMMCIFCategory)
DefineStreamFunctions(CMMCIFCategory)

class CMMCIFCategory : public CStream  {

  friend class  CMMCIFData;

  public :

    CMMCIFCategory ();
    CMMCIFCategory ( cpstr N );
    CMMCIFCategory ( RPCStream Object );
    ~CMMCIFCategory();

    pstr   GetCategoryName    () { return name;           }
    virtual int  GetCategoryID() { return MMCIF_Category; }
    virtual void WriteMMCIF   ( RCFile f ) {}
    virtual void Optimize     ();

    void  Sort     ();
    int   GetTagNo ( cpstr ttag );
    int   AddTag   ( cpstr ttag );

    int   GetNofTags  () { return nTags; }
    pstr  GetTag      ( int tagNo );  // 0..nTags-1
    void  PrintTags   ();
    Boolean CheckTags ( pstr * tagList );

    virtual void Copy ( PCMMCIFCategory Category );

    void  write    ( RCFile f );
    void  read     ( RCFile f );

  protected:
    int      nTags;
    pstr     name;
    psvector tag;
    ivector  index;
    int      nAllocTags;

    void          InitMMCIFCategory ();
    virtual void  FreeMemory        ();
    void          ExpandTags        ( int nTagsNew );
    void          PutCategoryName   ( cpstr newName );

};



//  ======================  CMMCIFStruct  ============================

DefineClass(CMMCIFStruct)
DefineStreamFunctions(CMMCIFStruct)

#define CIF_NODATA_DOT       0
#define CIF_NODATA_QUESTION  1

class CMMCIFStruct : public CMMCIFCategory  {

  public :
    psvector field;

    CMMCIFStruct ();
    CMMCIFStruct ( cpstr N );
    CMMCIFStruct ( RPCStream Object );
    ~CMMCIFStruct();

    void AddField     ( cpstr F, cpstr T,
                        Boolean Concatenate=False );
    int  GetCategoryID() { return MMCIF_Struct; }
    void Optimize     ();

    pstr GetField    ( int tagNo );  // 0..nTags-1
    int  GetString   ( pstr     & S, cpstr TName,
                                     Boolean Remove=False );
    pstr GetString   ( cpstr TName, int & RC ); // NULL if TName
                                                     // is not there
    int  DeleteField ( cpstr TName );  // <0 the field was not
                                            // there
    int  GetReal     ( realtype & R, cpstr TName,
                                     Boolean Remove=False );
    int  GetInteger  ( int      & I, cpstr TName,
                                     Boolean Remove=False );

    //    PutString WILL NOT add the string if it consists only of
    // spaces and NonBlankOnly is set to True. Any previous field for
    // this tag will be removed, though.
    void PutString   ( cpstr S, cpstr TName,
                       Boolean NonBlankOnly=False );
    void PutDate     ( cpstr T );
    void PutNoData   ( int NoDataType, cpstr T  );
    void PutReal     ( realtype R, cpstr TName, int prec=8 );
    void PutInteger  ( int      I, cpstr TName );

    Boolean WriteMMCIFStruct ( cpstr FName,
                               byte gzipMode=GZM_CHECK );
    void    WriteMMCIF       ( RCFile f   );

    void Copy  ( PCMMCIFCategory Struct );

    void write ( RCFile f );
    void read  ( RCFile f );

  protected:

    void InitMMCIFStruct();
    void FreeMemory();

};



//  ======================  CMMCIFLoop  ==============================

DefineClass(CMMCIFLoop)
DefineStreamFunctions(CMMCIFLoop)

class CMMCIFLoop : public CMMCIFCategory  {

  friend class CMMCIFData;

  public :

    CMMCIFLoop ();
    CMMCIFLoop ( cpstr N );
    CMMCIFLoop ( RPCStream Object );
    ~CMMCIFLoop();

    //  AddLoopTag(..) adds tag T to the list of tags and removes
    //  any existing fields if Remove is set to True.
    void  AddLoopTag   ( cpstr T, Boolean Remove=True );
    //   AddString will add NULL if S consists only of spaces and
    // NonBlankOnly is set to True.
    void  AddString    ( cpstr S, Boolean NonBlankOnly=False );
    void  AddNoData    ( int NoDataType );
    void  AddReal      ( realtype R, int prec=8 );
    void  AddInteger   ( int I          );

    int   GetLoopLength() { return nRows; }
    pstr  GetField     ( int rowNo, int tagNo );
    int   GetString    ( pstr & S, cpstr TName, int nrow,
                                       Boolean Remove=False );

    //  if GetString returns NULL but RC=0 then the field was
    //  either '.' or '?'
    pstr  GetString    ( cpstr TName, int nrow, int & RC );
    int   DeleteField  ( cpstr TName, int nrow );
    int   DeleteRow    ( int nrow );

    // returns 0 if GetXxxx(..) had success
    int   GetReal      ( realtype & R, cpstr TName, int nrow,
                                       Boolean Remove=False );
    int   GetInteger   ( int      & I, cpstr TName, int nrow,
                                       Boolean Remove=False );

    int   GetSVector   ( psvector & S, cpstr TName,
                           int i1=0, int i2=MaxInt4,
                           Boolean Remove=False );
    int   GetRVector   ( rvector  & R, cpstr TName,
                           int i1=0, int i2=MaxInt4,
                           Boolean Remove=False );
    int   GetIVector   ( ivector  & I, cpstr TName,
                           int i1=0, int i2=MaxInt4,
                           Boolean Remove=False );

    void  PutString    ( cpstr S, cpstr T, int nrow );
    void  PutNoData    ( int NoDataType, cpstr T, int nrow );
    void  PutReal      ( realtype R, cpstr T, int nrow,
                                     int prec=8 );
    void  PutInteger   ( int      I, cpstr T, int nrow );

    void  PutSVector   ( psvector S, cpstr T, int i1, int i2 );
    void  PutRVector   ( rvector  R, cpstr T, int i1, int i2,
                                                   int prec=8 );
    void  PutIVector   ( ivector  I, cpstr T, int i1, int i2 );

    int   GetCategoryID() { return MMCIF_Loop; }
    void  Optimize     ();

    Boolean WriteMMCIFLoop ( cpstr FName,
                             byte gzipMode=GZM_CHECK );
    void    WriteMMCIF     ( RCFile f   );

    void  Copy  ( PCMMCIFCategory Loop );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected:
    int      nRows;
    psmatrix field;
    int      iColumn,nAllocRows;

    void  InitMMCIFLoop();
    void  FreeMemory   ();
    void  DeleteFields ();
    void  ExpandRows   ( int nRowsNew );

};



//  ======================  CMMCIFData  =============================


//    CIFW are warnings which may be issued on reading the CIF file.
// Each of them means actually a CIF syntax error.
#define CIFW_UnrecognizedItems 0x00000020
#define CIFW_MissingField      0x00000040
#define CIFW_EmptyLoop         0x00000080
#define CIFW_UnexpectedEOF     0x00000100
#define CIFW_LoopFieldMissing  0x00000200
#define CIFW_NotAStructure     0x00000400
#define CIFW_NotALoop          0x00000800
#define CIFW_DuplicatedTag     0x00001000

//    CIFRC are return codes from procedures of extracting data from
// the read CIF file. Negative returns reflect unsuccessful and
// not accomplished operation.
#define CIFRC_Loop              2
#define CIFRC_Structure         1
#define CIFRC_Ok                0
#define CIFRC_StructureNoTag   -1
#define CIFRC_LoopNoTag        -2
#define CIFRC_NoCategory       -3
#define CIFRC_WrongFormat      -4
#define CIFRC_NoTag            -5
#define CIFRC_NotAStructure    -6
#define CIFRC_NotALoop         -7
#define CIFRC_WrongIndex       -8
#define CIFRC_NoField          -9
#define CIFRC_Created         -12
#define CIFRC_CantOpenFile    -13
#define CIFRC_NoDataLine      -14


//
//  Functional flags:
//  ~~~~~~~~~~~~~~~~~
//
//  CIFFL_PrintWarnings      when reading CIF file, all warning
//                           messages will be printed. If the flag
//                           is off, the warnings will be bit-encoded
//                           in the return code
//  CIFFL_StopOnWarnings     reading CIF file will stop at first
//                           warning issued
//  CIFFL_SuggestCategories  allows reading CIF file with loops having
//                           no categories. Hidden category names
//                           will be automatically generated for
//                           internal consistency of the system.
//                           These names will not appear in output.
//                           As these names are hidden, they cannot
//                           be used to access data. It is therefore
//                           assumed that all tags in all loops without
//                           categories are unique. Simply specify ""
//                           for category when accessing such data
//                           (it cannot be accessed through CMMCIFLoop,
//                           but only through CMMCIFData functions
//                           taking both Category and Tag; note that
//                           CIFFL_SuggestCategories flag must be on
//                           while accessing such data).
//  CIFFL_SuggestTags        allows for identical tags in a category
//                           (including a hidden category). Hidden
//                           suffixes to tag names will be generated
//                           for internal consistency. At present,
//                           only data for first non-unique tag may be
//                           accessed.
//
#define CIFFL_PrintWarnings      0x00000001
#define CIFFL_StopOnWarnings     0x00000002
#define CIFFL_SuggestCategories  0x00000004
#define CIFFL_SuggestTags        0x00000008


DefineClass(CMMCIFData)
DefineStreamFunctions(CMMCIFData)

class CMMCIFData : public CStream  {

  friend class CMMCIFFile;

  public :

    CMMCIFData ();
    CMMCIFData ( cpstr N );
    CMMCIFData ( RPCStream Object );
    ~CMMCIFData();


    // -------- General I/O functions

    void    SetPrintWarnings ( Boolean SPW );
    void    SetStopOnWarning ( Boolean SOW );
    void    SetFlag          ( int F );
    void    RemoveFlag       ( int F );
    int     GetWarnings      () { return Warning; }

    //   SetWrongFields() sets names (category.tag) of those
    // fields which are to be ignored on input. In a loop,
    // the whole column category.tag is assumed missing
    // (it will be an error if the column is physically
    // there).
    //   Lists of 'cats' and 'tags' must be of equal length
    // and they must be terminated by NULL.
    //   To remove the previous setting, call
    // SetWrongFields ( NULL,NULL ).
    //   SetWrongFields() may be used for reading corrupted
    // CIF files.
    void    SetWrongFields   ( pstr * cats, pstr * tags );

    int     ReadMMCIFData    ( cpstr FName,
                               byte gzipMode=GZM_CHECK );
    int     ReadMMCIFData    ( RCFile f, pstr S, int & lcount );

    Boolean WriteMMCIFData   ( cpstr FName,
                               byte gzipMode=GZM_CHECK );
    void    WriteMMCIF       ( RCFile f   );


    // -------- Retrieving data

    int   GetNumberOfCategories ()  { return nCategories; }
    PCMMCIFCategory GetCategory ( int categoryNo ); // 0..nCategories-1
    PCMMCIFStruct GetStructure  ( cpstr CName );
    PCMMCIFLoop   GetLoop       ( cpstr CName );

    //  FindLoop(..) finds a loop containing all tags from the
    //  tag list provided. The tag list should be terminated
    //  by empty tag "". The function returns NULL if such a loop
    //  was not found.
    PCMMCIFLoop   FindLoop     ( pstr * tagList );

    //   If dname is not NULL, first it is attempted to deallocate.
    // If Remove flag is set on then no actual space reallocation is
    // occured: just the internal pointer is copied to dname. The
    // calling process wiil then be responsible for eventual
    // deallocation of dname. This is also true for all
    // string-extracting functions below.
    void GetDataName ( pstr & dname, Boolean Remove=False );
    pstr GetDataName ()  { return name; }

    //   CheckData(..) returns positive value if the field is in the
    // file:
    //   CIFRC_Structure  category CName is a structure
    //   CIFRC_Loop       category CName is a loop
    // Negative returns mean:
    //   CIFRC_StructureNoTag  category CName is present,
    //                        it is a structure, but it does not
    //                        have tag TName
    //   CIFRC_LoopNoTag       category CName is present,
    //                        it is a loop, but it does not have
    //                        tag TName
    //   CIFRC_NoCategory      category CName is not present.
    // If TName is set to NULL then only the CName is checked and
    // possible returns are CIFRC_Structure, CIFRC_Loop and 
    // CIFRC_NoCategory.
    int  CheckData       ( cpstr CName, cpstr TName );

    int  DeleteCategory  ( cpstr CName );
    int  DeleteStructure ( cpstr CName );
    int  DeleteLoop      ( cpstr CName );

    //   Optimize() optimizes the CIF data in memory allocation. It is
    // a good idea to call it once after extraction of data (GetXXXXXX
    // functions) with Remove flag set on has been completed.
    void Optimize();

    //   GetString(..), GetReal(..) and GetInteger(..) return 0 if the
    // requested field was found and successfully converted. Negative
    // returns mean:
    //    CIFRC_WrongFormat   the field was found but failed to convert
    //                        due to improper numeric format
    //    CIFRC_NoTag         category CName was found, but it does not
    //                        have tag TName
    //    CIFRC_NoCategory    category CName was not found
    //    CIFRC_NotAStructure category CName was found, but it is
    //                        a loop rather than a structure.
    //   GetString(..) will try to dispose Dest unless it is assigned
    // NULL value before the call. The string will be then dynamically
    // allocated and copied.
    //   If Remove is set to True, the field will be removed after
    // extraction.
    int  GetString   ( pstr & Dest, cpstr CName, cpstr TName,
                                    Boolean Remove=False );
    pstr GetString   ( cpstr CName, cpstr TName, int & RC );
    int  DeleteField ( cpstr CName, cpstr TName );
    int  GetReal     ( realtype & R, cpstr CName,
                       cpstr TName, Boolean Remove=False );
    int  GetInteger  ( int & I, cpstr CName, cpstr TName,
                                Boolean Remove=False );

    //   GetLoopLength(..) returns CIFRC_NotALoop if the category CName
    // is not a loop, CIFRC_NoCategory if the category CName is not
    // found. Non-negative returns give the length of the loop (may be
    // 0 if the loop is empty).
    int  GetLoopLength ( cpstr CName );

    //   GetLoopString(..), GetLoopReal(..) and GetLoopInteger(..) act
    // like GetString(..), GetReal(..) and GetInteger(..) above for
    // nrow-th element of the 'loop_' (indexed like 0..N-1 where N
    // is obtained through GetLoopLength(..)). They will return
    // CIFRC_WrongIndex if nrow is out of range.
    //   If Remove is set to True, the field will be removed after
    // extraction.
    int  GetLoopString   ( pstr & Dest, cpstr CName,
                                        cpstr TName, int nrow,
                                        Boolean Remove=False );
    pstr GetLoopString   ( cpstr CName, cpstr TName,
                           int nrow, int & RC );
    int  DeleteLoopField ( cpstr CName, cpstr TName,
                           int nrow );
    int  GetLoopReal     ( realtype & R, cpstr CName,
                                         cpstr TName, int nrow,
                                         Boolean Remove=False );
    int  GetLoopInteger  ( int & I, cpstr CName,
                                    cpstr TName, int nrow,
                                    Boolean Remove=False );

    //   GetLoopSVector(..), GetLoopRVector(..) and GetLoopIVector(..)
    // read CIF 'loop_' data into allocated vectors of strings, reals
    // and integers, correspondingly. The vectors may be deallocated
    // prior to call and assigned NULL, in which case they will be
    // allocated with offsets of i1, which is also the lower index of
    // the 'loop_' data transferred into it. The upper vector index is
    // given by i2 or by the loop's length whichever is less. If
    // vectors are not assigned NULL prior the call, it is assumed
    // that they are properly (i1-offset, i2-i1+1 length) allocated.
    //   The return codes are same as those of GetLoopString(..),
    // GetLoopReal(..) and GetLoopInteger(..).
    int  GetLoopSVector ( psvector & S, cpstr CName,
                          cpstr TName, int i1=0, int i2=MaxInt4,
                          Boolean Remove=False );
    int  GetLoopRVector ( rvector  & R, cpstr CName,
                          cpstr TName, int i1=0, int i2=MaxInt4,
                          Boolean Remove=False );
    int  GetLoopIVector ( ivector  & I, cpstr CName,
                          cpstr TName, int i1=0, int i2=MaxInt4,
                          Boolean Remove=False );


    // -------- Storing data

    //   Unless the data are to be added to the existing CIF structure,
    // FreeMemory() should be called once before creating a new
    // CIF data set.
    void FreeMemory ( int key );

    void PutDataName ( cpstr dname ); // stores name for 'data_'
                                           // record

    //   PutString(..), PutReal(..) and PutInteger(..) will put the
    // values given into the specified category (CName) under the
    // specified tag (TName). The category, tag and field are created
    // automatically; the field will be replaced silently if identical
    // CName.TName is specified in two calls. Calls of these functions
    // may follow in random order; however CIF file will have all tags
    // grouped by categories and catgories will follow in the order
    // of first appearance in PutString(..), PutReal(..) or
    // PutInteger(..).
    //   Return code - one of CIFRC_Ok or CIFRC_NotAStruct
    int  PutNoData   ( int NoDataType, cpstr CName,
                       cpstr TName );
    int  PutString   ( cpstr S, cpstr CName,
                       cpstr TName, Boolean Concatenate=False );
    int  PutDate     ( cpstr CName, cpstr TName );
    int  PutReal     ( realtype R, cpstr CName, cpstr TName,
                                   int prec=8 );
    int  PutInteger  ( int I, cpstr CName, cpstr TName );

    //   If loop category CName is not present in the CIF data
    // structure, AddLoop(..) creates an empty one and returns
    // its pointer in Loop. If loop category CName is already in
    // the CIF data structure, its pointer is returned, and any
    // data which might be contained in it, remains untouched.
    //   To stuff the loop with data, first the data tags have to
    // be specified by calling  Loop->AddLoopTag(..). After all
    // tags are given, the data comes as a stream of calls
    // Loop->AddString(..), Loop->AddReal(..) and
    // Loop->AddInteger(..) which should provide data for every
    // tag in sequence in strictly the same order as the tags
    // were given. This essentially reflects reading a CIF loop
    // from a file.
    //   Alternatively, the loop data may be stored with PutLoopXXX()
    // functions given below, although this way may be less
    // efficient (but more flexible).
    //   AddLoop(..) may return
    //     CIFRC_Ok       category was present
    //     CIFRC_Created  category was not present but it has
    //                    been created; the category is empty
    //     CIFRC_NotALoop category was present as a structure, but
    //                    has been replaced for a loop;
    //                    the category is empty.
    int  AddLoop      ( cpstr CName, PCMMCIFLoop   & Loop   );
    int  AddStructure ( cpstr CName, PCMMCIFStruct & Struct );

    //   PutLoopString(..), PutLoopReal(..) and PutLoopInteger(..) act
    // like PutString(..), PutReal(..) and PutInteger(..) above for
    // nrow-th element of the 'loop_' CName (indexed begining from 0).
    // In consequitive calls, given values of nrow does not have to be
    // ordered; the most efficient way is to start with HIGHEST value
    // for nrow in the loop and move down to 0. The least efficient way
    // is to start with nrow=0 and move up.
    //   These functions allow to form loops in arbitrary way.
    //   The functions may return CIFRC_Ok or CIFRC_NotALoop. 
    int  PutLoopNoData  ( int NoDataType, cpstr CName,
                                          cpstr TName, int nrow );
    int  PutLoopString  ( cpstr S,   cpstr CName,
                                          cpstr TName, int nrow );
    int  PutLoopReal    ( realtype R, cpstr CName,
                                      cpstr TName, int nrow,
                                      int  prec=8 );
    int  PutLoopInteger ( int I, cpstr CName, cpstr TName,
                                 int nrow );

    //   PutLoopSVector(..), PutLoopRVector(..) and PutLoopIVector(..)
    // put vectors of values into specified loop fields. Parameters i1
    // and i2 give the range of indices of values which are to be
    // transfered. To transfer an entire vector allocated as [0..N-1]
    // i1 shoudl be set to 0 and i2 - to N-1. Note that the loop is
    // always indexed as starting form 0 on, therefore negative i1 and
    // i2 are not allowed, and specifying i1>0 will leave first i1
    // elements of the CIF loop for the corresponding tag undefined
    // (will be output like '?').
    //   These functions allow to form loops in arbitrary way.
    int  PutLoopSVector ( psvector S, cpstr CName,
                          cpstr TName, int i1, int i2 );
    int  PutLoopRVector ( rvector  R, cpstr CName,
                          cpstr TName, int i1, int i2,
                          int prec=8 );
    int  PutLoopIVector ( ivector  I, cpstr CName,
                          cpstr TName, int i1, int i2 );

    int  RenameCategory ( cpstr CName, cpstr newCName );

    // --------

    void Copy         ( PCMMCIFData Data );
    int  CopyCategory ( PCMMCIFData Data, cpstr CName,
                                          cpstr newCName=NULL );

    void PrintCategories();  // for debuging only

    void write ( RCFile f );
    void read  ( RCFile f );

  protected:
    pstr             name;
    int              nCategories;
    PPCMMCIFCategory Category;
    ivector          index;
    int              flags;
    int              Warning;
    int              loopNo;  // used locally for suggesting categories
    int              tagNo;   // used locally for suggesting tags
    psvector         WrongCat;
    psvector         WrongTag;
    int              nWrongFields;

    void    InitMMCIFData   ();
    void    FreeWrongFields ();
    Boolean CheckWrongField ( cpstr C, cpstr T );
    void    Sort            ();

    //   GetCategoryNo searches for index of category cname
    // in Category[]. Return:
    //    >=0 : position of the category found
    //     <0 : the category was not found, it could be inserted before
    //          (-RC-1)th element, where RC is the return value
    int  GetCategoryNo  ( cpstr cname );
    int  AddCategory    ( cpstr cname );
    int  DeleteCategory ( int  CatNo );

    void GetDataItem    ( RCFile f, pstr S, pstr & L, pstr & p,
                                    int & lcount, int & llen );
    void GetLoop        ( RCFile f, pstr S, pstr & L, pstr & p,
                                    int & lcount, int & llen );
    int  GetField       ( RCFile f, pstr S, pstr & L, pstr & p,
                                    int & lcount, int & llen );

};



//  ======================  CMMCIFFile  =============================

DefineClass(CMMCIFFile)
DefineStreamFunctions(CMMCIFFile)

class CMMCIFFile : public CStream  {

  public :
    int          nData;
    ivector      index;
    PPCMMCIFData data;

    CMMCIFFile ();
    CMMCIFFile ( cpstr FName, byte gzipMode=GZM_CHECK );
    CMMCIFFile ( RPCStream Object );
    ~CMMCIFFile();

    void  SetPrintWarnings ( Boolean SPW ) { PrintWarnings = SPW; }
    void  SetStopOnWarning ( Boolean SOW ) { StopOnWarning = SOW; }

    int   ReadMMCIFFile    ( cpstr FName,byte gzipMode=GZM_CHECK);
    int   WriteMMCIFFile   ( cpstr FName,byte gzipMode=GZM_CHECK);

    int   GetNofData()  { return nData; }
    PCMMCIFData GetCIFData ( int        dataNo );  // 0..nData-1
    PCMMCIFData GetCIFData ( cpstr DName  );
    int   AddMMCIFData     ( cpstr DName  );
    int   GetCIFDataNo     ( cpstr DName  );

    void  WriteMMCIF       ( RCFile f    );

    void  Copy  ( PCMMCIFFile File );

    void  write ( RCFile f );
    void  read  ( RCFile f );

  protected:
    int     nAllocData;
    Boolean PrintWarnings;
    Boolean StopOnWarning;

    void  InitMMCIFFile();
    void  FreeMemory   ();
    void  Sort         ();
    void  ExpandData   ( int nDataNew );

};

extern pstr GetMMCIFInputBuffer ( int & LineNo );

//  isCIF will return
//    -1   if file FName does not exist
//     0   if file FName is likely a CIF file ( 'data_' is present )
//     1   if file FName is not a CIF file ( 'data_' is absent )
extern int isCIF ( cpstr FName, byte gzipMode=GZM_CHECK );

pstr GetCIFMessage ( pstr M, int RC );


#endif


