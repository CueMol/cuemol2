//  $Id: file_.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  file_  <interface>
//       ~~~~~~~~~
//  **** Classes :  CFile  - file I/O Support.
//       ~~~~~~~~~
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef  __File__
#define  __File__

#ifndef  __STDIO_H
#include <stdio.h>
#endif

#ifndef  __MatType__
#include "mattype_.h"
#endif


//  ========================  CFile Class  ========================

#define  MaxFileNameLength                512

#define  FM_Binary                        False
#define  FM_Text                          True

#define  GZM_NONE                         0
#define  GZM_CHECK                        1
#define  GZM_ENFORCE                      2
#define  GZM_ENFORCE_GZIP                 2
#define  GZM_ENFORCE_COMPRESS             3


#define  FileError_NoMemory               110
#define  FileError_ShortData              111
#define  FileError_NoDataFound            112
#define  FileError_NoColumn               113
#define  FileError_BadData                114
#define  FileError_WrongMemoryAllocation  115


// ===================  Auxilary Functions  =========================

#define syskey_unix  1
#define syskey_win   2
#define syskey_all   3

extern pstr  GetFPath   ( pstr  FilePath, int syskey=syskey_unix );
extern cpstr GetFName   ( cpstr FilePath, int syskey=syskey_unix );
extern cpstr GetFExt    ( cpstr FilePath );
extern pstr  ChangeExt  ( pstr  FilePath, cpstr newExt,
                                          int syskey=syskey_unix );
extern cpstr FileError        ( int   ErrCode     );
extern void  RemoveDelimiters ( pstr  S, int SLen );
extern void  PickOutNumber    ( cpstr S, pstr SV, int SLen, int & j );


// =========================  CFile  ================================

DefineClass(CFile)

class  CFile  {

  public :

    CFile ( word BufSize=4096 );
    virtual  ~CFile();

    // ---- control functions
    //   FileName allows for "stdin", "stdout" and "stderr" as
    // for standard UNIX streams.
    void     assign      ( cpstr FileName,
                           Boolean Text=False,
                           Boolean UniB=False,
                           byte    gzMode=GZM_NONE );
    //   assign for memory IO
    void     assign     ( word poolSize, word sizeInc, pstr filePool );
    void     GetFilePool ( pstr & filePool, word & fileSize );

    pstr     FileName    () { return FName; }
    Boolean  reset       ( Boolean ReadOnly=False, int retry=0 );
                            // = true if opened, each retry 1 sec sleep
    Boolean  erase       ();   // = true if erased
    Boolean  exists      ();   // = true if exists
    Boolean  parse       ( cpstr FileName ); // true if filled
    Boolean  rename      ( cpstr NewFileName ); // true if renamed
    Boolean  rewrite     ();    // = true if opened
    Boolean  append      ();    // = true if opened
    Boolean  isOpen      ();
    long     Position    ();
    long     FileLength  () { return FLength; }
    Boolean  seek        ( long Position );
    Boolean  FileEnd     ();
    Boolean  Success     () { return IOSuccess; }
    void     SetSuccess  () { IOSuccess = True; }
    void     shut        ();

    // ---- binary I/O
    word     ReadFile     ( void * Buffer, word Count );
    word     CreateRead   ( pstr & Line );
    word     ReadTerLine  ( pstr Line, Boolean longLine=False );
    Boolean  WriteFile    ( const void * Buffer, word Count );
    Boolean  CreateWrite  ( cpstr Line );
    Boolean  WriteTerLine ( cpstr Line, Boolean longLine=False );
    //  machine-dependent binary I/O
    Boolean  WriteReal   ( realtype * V );
    Boolean  WriteFloat  ( realtype * V );
    Boolean  WriteInt    ( int      * I );
    Boolean  WriteShort  ( short    * S );
    Boolean  WriteLong   ( long     * L );
    Boolean  WriteBool   ( Boolean  * B );
    Boolean  WriteByte   ( byte     * B );
    Boolean  WriteWord   ( word     * W );
    Boolean  ReadReal    ( realtype * V );
    Boolean  ReadFloat   ( realtype * V );
    Boolean  ReadInt     ( int      * I );
    Boolean  ReadShort   ( short    * S );
    Boolean  ReadLong    ( long     * L );
    Boolean  ReadBool    ( Boolean  * B );
    Boolean  ReadByte    ( byte     * B );
    Boolean  ReadWord    ( word     * B );
    Boolean  AddReal     ( realtype * V );
    Boolean  AddFloat    ( realtype * V );
    Boolean  AddInt      ( int      * I );
    Boolean  AddShort    ( short    * S );
    Boolean  AddLong     ( long     * L );
    Boolean  AddByte     ( byte     * B );
    Boolean  AddWord     ( word     * B );
    //  complex data binary I/O
    Boolean  WriteVector      ( rvector    V, int len,    int Shift );
    Boolean  WriteVector      ( ivector   iV, int len,    int Shift );
    Boolean  WriteVector      ( lvector   lV, int len,    int Shift );
    Boolean  WriteVector      ( bvector    B, int len,    int Shift );
    Boolean  ReadVector       ( rvector    V, int maxlen, int Shift );
    Boolean  ReadVector       ( ivector   iV, int maxlen, int Shift );
    Boolean  ReadVector       ( lvector   lV, int maxlen, int Shift );
    Boolean  ReadVector       ( bvector    B, int maxlen, int Shift );
    Boolean  CreateReadVector ( rvector &  V, int & len,  int Shift );
    Boolean  CreateReadVector ( ivector & iV, int & len,  int Shift );
    Boolean  CreateReadVector ( lvector & lV, int & len,  int Shift );
    Boolean  CreateReadVector ( bvector &  B, int & len,  int Shift );
    Boolean  CreateReadVector ( rvector &  V, int Shift );
    Boolean  CreateReadVector ( ivector & iV, int Shift );
    Boolean  CreateReadVector ( lvector & lV, int Shift );
    Boolean  CreateReadVector ( bvector &  B, int Shift );
    Boolean  WriteMatrix      ( rmatrix & A,  int N, int M,
                                int  ShiftN,  int ShiftM );
    Boolean  CreateReadMatrix ( rmatrix & A,  int ShiftN, int ShiftM );
    Boolean  CreateReadMatrix ( rmatrix & A,  int & N, int & M,
                                int ShiftN, int ShiftM );

    // ---- text I/O
    Boolean  Write       ( cpstr  Line );          // writes without LF
    Boolean  Write       ( realtype V, int length=10 ); // w/o LF
    Boolean  Write       ( int     iV, int length=5  ); // w/o LF
    Boolean  WriteLine   ( cpstr  Line );         // writes and adds LF
    Boolean  LF          ();                            // just adds LF
    word     ReadLine    ( pstr   Line, word MaxLen=255 );
    word     ReadNonBlankLine ( pstr S, word MaxLen=255 );

    //  complex data text I/O

    // writes with spaces and adds LF
    Boolean  WriteDataLine  ( realtype X, realtype Y,
                              int length=10 );

    Boolean  WriteParameter ( cpstr S, realtype X, // writes parameter
                              int ParColumn=40,   // name S and value X
                              int length=10 );   // at column ParColumn
                                                // and adds LF.

    Boolean  WriteParameters ( cpstr S, int n_X, // writes parameter
                               rvector X,      // name S and n_X values
                               int ParColumn=40, // X[0..n_X-1] at col
                               int length=10 );  // ParColumn, ads LF.

    Boolean  ReadParameter  ( pstr S, realtype & X, // reads parameter
                              int ParColumn=40 );   // name S and val X
    Boolean  ReadParameter  ( pstr S, int & X,
                              int ParColumn=40 );

    Boolean  ReadParameters ( pstr S, int & n_X,  // reads parameter
                              rvector X,          // name S, counts the
                              int MaxLen=255,     // of values n_X and
                              int ParColumn=40 ); // reads X[0..n_X-1].
                                              // MaxLen gives sizeof(S)

    //   WriteColumns writes data stored in X, Y and Z in the form
    // of columns, adding a blank line in the end. If Z (or Z and Y)
    // are set to NULL, then only X and Y (or only X) are written.
    //   Shift corresponds to the begining of arrays' enumeration
    // X[Shift..Shift+len-1].
    Boolean  WriteColumns    ( rvector X, rvector Y, rvector Z,
                               int len, int Shift, int MLength );
    Boolean  WriteColumns    ( rvector X, rvector Y,
                               int len, int Shift, int MLength );

    //   ReadColumns reads data stored by WriteColumns. X, Y, and Z
    // must be allocated prior to call.
    //   xCol, yCol and zCol specify the order number of columns
    // (starting from 0) to be read into X, Y and Z, correspondingly.
    // If zCol (or zCol and yCol) < 0 then Z (or Z and Y) are not read.
    //   Shift corresponds to the begining of arrays' enumeration
    // X[Shift..Shift+len-1].
    //   Returns number of lines read.
    int      ReadColumns     ( int maxlen, rvector X, rvector Y, rvector Z,
                               int xCol, int yCol, int zCol, int Shift );
    int      ReadColumns     ( int maxlen, rvector X, rvector Y,
                               int xCol, int yCol, int Shift );

    //   CreateReadColumns reads data stored by WriteColumns. X, Y,
    // and Z must be set to NULL prior to call. They will be allocated
    // within the procedure.
    //   xCol, yCol and zCol specify the order number of columns
    // (starting from 0) to be read into X, Y and Z, correspondingly.
    // If zCol (or zCol and yCol) < 0 then Z (or Z and Y) are not read.
    //   Shift corresponds to the begining of arrays' enumeration
    // X[Shift..Shift+len-1].
    //   Returns number of lines read, errors are reported by
    // ErrorCode().
    int    CreateReadColumns ( rvector & X, rvector & Y, rvector & Z,
                            int xCol, int yCol, int zCol, int Shift );
    int    CreateReadColumns ( rvector & X, rvector & Y,
                            int xCol, int yCol, int Shift );

    // ---- miscellaneous
    realtype GetNumber ( cpstr S );
    FILE *   GetHandle () { return hFile; }

  protected :
    word     Buf_Size;
    Boolean  TextMode,UniBin;
    byte     gzipMode;
    pstr     IOBuf;
    word     BufCnt,BufLen,BufInc;
    FILE   * hFile;
    Boolean  EofFile;
    pstr     FName;
    long     FLength;
    Boolean  IOSuccess;
    int      ErrCode;

    void  FreeBuffer     ();
    void  _ReadColumns   ( int & DLen, pstr S, int SLen,
                           rvector X, rvector Y, rvector Z,
                           int xCol, int yCol, int zCol, int Shift );

  private :
    int      gzipIO;
    Boolean  StdIO,memIO;

};


extern void SetGZIPPath     ( pstr gzipPath,     pstr ungzipPath     );
extern void SetCompressPath ( pstr compressPath, pstr uncompressPath );

extern Boolean FileExists   ( cpstr FileName, PCFile f=NULL );


#endif

