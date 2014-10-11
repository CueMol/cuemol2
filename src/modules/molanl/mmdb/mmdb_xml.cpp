//  $Id: mmdb_xml.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//  **** Module  :  MMDB_XML <implementation>
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

#ifndef  __STDLIB_H
#include <stdlib.h>
#endif

#ifndef  __STRING_H
#include <string.h>
#endif


#ifndef  __MMDB_XML__
#include "mmdb_xml.h"
#endif


//  ======================  CXMLObject  ==========================

CXMLObject::CXMLObject() : CStream()  {
  InitXMLObject();
}

CXMLObject::CXMLObject ( cpstr Tag ) : CStream()  {
  InitXMLObject();
  SetTag  ( Tag );
}

CXMLObject::CXMLObject ( cpstr Tag, cpstr Data )
          : CStream()  {
  InitXMLObject();
  SetTag  ( Tag  );
  SetData ( Data );
}

CXMLObject::CXMLObject ( cpstr Tag, realtype V, int length )
          : CStream()  {
  InitXMLObject();
  SetTag  ( Tag      );
  SetData ( V,length );
}

CXMLObject::CXMLObject ( cpstr Tag, int iV, int length )
          : CStream()  {
  InitXMLObject();
  SetTag  ( Tag       );
  SetData ( iV,length );
}

CXMLObject::CXMLObject ( cpstr Tag, Boolean bV ) : CStream()  {
  InitXMLObject();
  SetTag  ( Tag );
  SetData ( bV  );
}

CXMLObject::CXMLObject ( cpstr Tag, PCXMLObject XMLObject )
          : CStream()  {
  InitXMLObject();
  SetTag    ( Tag       );
  AddObject ( XMLObject );
}


CXMLObject::CXMLObject ( RPCStream Object ) : CStream(Object)  {
  InitXMLObject();
}

CXMLObject::~CXMLObject()  {
  FreeMemory();
}

void  CXMLObject::InitXMLObject()  {
  objTag   = NULL;
  objData  = NULL;
  nObjects = 0;
  nAlloc   = 0;
  object   = NULL;
}

void  CXMLObject::FreeMemory()  {
int i;
  if (objTag)   delete[] objTag;
  if (objData)  delete[] objData;
  if (object)  {
    for (i=0;i<nAlloc;i++)
      if (object[i])  delete object[i];
    delete[] object;
  }
  objTag   = NULL;
  objData  = NULL;
  nObjects = 0;
  nAlloc   = 0;
  object   = NULL;
}

void  CXMLObject::SetTag ( cpstr Tag )  {
pstr p,t;
int  n;

  // count ampersands
  p = pstr(Tag);
  n = 0;
  while (*p)  {
    if (*p=='&')  n++;
    p++;
  }
  // calculate the tag length
  n = n*4 + strlen(Tag) + 1;
  // substract leading underscores
  p = pstr(Tag);
  while (*p=='_')  {
    p++;
    n--;
  }
  // allocate tag space
  if (objTag)  delete[] objTag;
  objTag = new char[n];
  // copy tag, replacing square brackets and ampersands
  t = objTag;
  while (*p)  {
    if (*p=='[')  {
      *t = '-';
      t++;
    } else if (*p==']')  {
      if ((p[1]) && (p[1]!='['))  {
        *t = '-';
        t++;
      }
    } else if (*p=='&')  {
      strcpy ( t,"_and_" );
      if (p[1])  t += 5;
           else  t += 4;
    } else  {
      *t = *p;
      t++;
    }
    p++;
  }
  *t = char(0);
}

void  CXMLObject::SetData ( cpstr Data )  {
pstr p,d;
int  n;
  // count ampersands
  p = pstr(Data);
  n = 0;
  while (*p)  {
    if (*p=='&')  n += 4;
    p++;
  }
  // calculate the Data length
  n += strlen(Data) + 1;  // eugene
  // allocate data space
  if (objData)  delete[] objData;
  objData = new char[n];
  // copy data, preceeding ampersands with the escape
  p = pstr(Data);
  d = objData;
  while (*p)  {
    if (*p=='&')  {
      d[0] = '&';
      d[1] = 'a';
      d[2] = 'm';
      d[3] = 'p';
      d[4] = ';';
      d += 5;
    } else  {
      *d = *p;
      d++;
    }
    p++;
  }
  *d = char(0);
}

void  CXMLObject::AddData ( cpstr Data )  {
pstr d1,d2;
  d1      = objData;
  objData = NULL;
  SetData ( Data );
  d2      = objData;
  objData = NULL;
  CreateConcat ( objData,d1,d2 );
}

void  CXMLObject::SetData ( realtype V, int length )  {
char N[500];
  sprintf    ( N,"%-.*g",length,V );
  CreateCopy ( objData,N );
}

void  CXMLObject::SetData ( int iV, int length )  {
char N[500];
  sprintf    ( N,"%*i",length,iV );
  CreateCopy ( objData,N );
}

void  CXMLObject::SetData ( Boolean bV )  {
  if (bV)  CreateCopy ( objData,pstr("Yes") );
     else  CreateCopy ( objData,pstr("No")  );
}


int CXMLObject::AddMMCIFCategory ( PCMMCIFCategory mmCIFCat )  {
  if (mmCIFCat->GetCategoryID()==MMCIF_Loop)
    return AddMMCIFLoop ( PCMMCIFLoop(mmCIFCat) );
  if (mmCIFCat->GetCategoryID()==MMCIF_Struct)
    return AddMMCIFStruct ( PCMMCIFStruct(mmCIFCat) );
  return -1;
}

pstr getCCIFTag ( pstr & ccifTag, cpstr Tag )  {
  if (Tag[0]=='_')  return CreateCopCat ( ccifTag,pstr("ccif") ,Tag );
              else  return CreateCopCat ( ccifTag,pstr("ccif_"),Tag );
}

int CXMLObject::AddMMCIFStruct ( PCMMCIFStruct mmCIFStruct )  {
PCXMLObject XMLObject1,XMLObject2;
pstr        SName,Tag,Field, ccifTag;
int         nTags,i,k;

  XMLObject1 = this;

  ccifTag = NULL;

  SName = mmCIFStruct->GetCategoryName();
  if (SName)  {
    if (SName[0]!=char(1))
      XMLObject1 = new CXMLObject ( getCCIFTag(ccifTag,SName) );
  }

  k = 0;
  nTags = mmCIFStruct->GetNofTags();
  for (i=0;i<nTags;i++)  {
    Tag = mmCIFStruct->GetTag ( i );
    if (Tag)  {
      XMLObject2 = new CXMLObject ( getCCIFTag(ccifTag,Tag) );
      Field = mmCIFStruct->GetField ( i );
      if (Field)  {
        if (Field[0]!=char(2))  XMLObject2->SetData ( Field );
                          else  XMLObject2->SetData ( &(Field[1]) );
      }
      XMLObject1->AddObject ( XMLObject2 );
      k++;
    }
  }
  
  if (SName)  {
    if (SName[0]!=char(1))
      AddObject ( XMLObject1 );
  }

  if (ccifTag)  delete[] ccifTag;

  return k;

}

int CXMLObject::AddMMCIFLoop ( PCMMCIFLoop mmCIFLoop )  {
PCXMLObject XMLObject1,XMLObject2,XMLObject3;
pstr        SName,Tag,Field,ccifTag;
int         nTags,nRows,i,j,k;

  XMLObject1 = this;

  ccifTag = NULL;

  SName = mmCIFLoop->GetCategoryName();
  if (SName)  {
    if (SName[0]!=char(1))
      XMLObject1 = new CXMLObject ( getCCIFTag(ccifTag,SName) );
  }

  k = 0;
  nTags = mmCIFLoop->GetNofTags   ();
  nRows = mmCIFLoop->GetLoopLength();
  for (i=0;i<nRows;i++)  {
    XMLObject2 = new CXMLObject ( pstr("row"),
                      new CXMLObject(pstr("_sernum_"),i+1) );
    for (j=0;j<nTags;j++)  {
      Tag = mmCIFLoop->GetTag ( j );
      if (Tag)  {
        XMLObject3 = new CXMLObject ( getCCIFTag(ccifTag,Tag) );
        Field = mmCIFLoop->GetField ( i,j );
        if (Field)  {
          if (Field[0]!=char(2))  XMLObject3->SetData ( Field );
                            else  XMLObject3->SetData ( &(Field[1]) );
        }
        XMLObject2->AddObject ( XMLObject3 );
        k++;
      }
    }
    XMLObject1->AddObject ( XMLObject2 );
  }
  
  if (SName)  {
    if (SName[0]!=char(1))
      AddObject ( XMLObject1 );
  }

  if (ccifTag)  delete[] ccifTag;

  return k;

}

int  CXMLObject::AddMMCIFData ( PCMMCIFData mmCIFData )  {
PCMMCIFCategory mmCIFCat;
int             nCats,i,k,n;
  nCats = mmCIFData->GetNumberOfCategories();
  k     = 0;
  n     = 0;
  for (i=0;(i<nCats) && (n>=0);i++)  {
    mmCIFCat = mmCIFData->GetCategory ( i );
    if (mmCIFCat)  {
      if (mmCIFCat->GetCategoryID()==MMCIF_Loop)
        n = AddMMCIFLoop ( PCMMCIFLoop(mmCIFCat) );
      else if (mmCIFCat->GetCategoryID()==MMCIF_Struct)
        n = AddMMCIFStruct ( PCMMCIFStruct(mmCIFCat) );
      else
        n = -1;
      if (n>=0)  k += n;
    }
  }
  if (n<0)  return -(k+1);
  return k;
}

pstr  CXMLObject::GetData ( cpstr Tag, int objNo )  {
PCXMLObject XMLObject;
  XMLObject = GetObject ( Tag,objNo );
  if (XMLObject)  return XMLObject->objData;
  return NULL;
}

int  CXMLObject::GetData ( pstr & Data, cpstr Tag, int objNo )  {
PCXMLObject XMLObject;
  XMLObject = GetObject ( Tag,objNo );
  if (XMLObject)  {
    Data = XMLObject->objData;
    return 0;
  } else  {
    Data = NULL;
    return 1;
  }
}

int  CXMLObject::GetData ( realtype & V, cpstr Tag, int objNo )  {
int  rc;
pstr d,p;
  rc = GetData ( d,Tag,objNo );
  if (d)  {
    V = strtod(d,&p);
    if ((V==0.0) && (p==d))  rc = 2;
                       else  rc = 0;
  } else if (!rc)
    rc = -1;
  return rc;
}

int  CXMLObject::GetData ( int & iV, cpstr Tag, int objNo )  {
int  rc;
pstr d,p;
  rc = GetData ( d,Tag,objNo );
  if (d)  {
    iV = mround(strtod(d,&p));
    if ((iV==0) && (p==d))  rc = 2;
                      else  rc = 0;
  } else if (!rc)
    rc = -1;
  return rc;
}

int  CXMLObject::GetData ( Boolean & bV, cpstr Tag, int objNo )  {
int  rc;
pstr d;
  rc = GetData ( d,Tag,objNo );
  if (d)  {
    if (!strcasecmp(d,"Yes"))
      bV = True;
    else {
      bV = False;
      if (strcasecmp(d,"No"))  rc = 2;
    }
  } else if (!rc)
    rc = -1;
  return rc;
}

PCXMLObject CXMLObject::GetObject ( cpstr Tag, int objNo )  {
// allow for "tag1>tag2>tag3>..."
PCXMLObject XMLObject;
int         i,j,k,l;
pstr        p,p1;
  XMLObject = this;
  if (Tag)  {
    p = pstr(Tag);
    do  {
      p1 = p;
      l  = 0;
      while (*p1 && (*p1!='>'))  {
        p1++;
        l++;
      }
      if (l>0)  {
        k = -1;
        j = 0;
        for (i=0;(i<XMLObject->nObjects) && (k<0);i++)
          if (XMLObject->object[i])  {
            if (!strncmp(XMLObject->object[i]->objTag,p,l))  {
              j++;
              if (j==objNo)  k = i;
            }
          }
        if (k<0)  {
          XMLObject = NULL;
          l = 0;
        } else  {
          XMLObject = XMLObject->object[k];
          if (*p1)  p = p1 + 1;
              else  l = 0;
        }
      }
    } while (l>0);
  }
  return XMLObject;
}

void  CXMLObject::AddObject ( PCXMLObject XMLObject, int lenInc )  {
PPCXMLObject obj1;
int          i;

  if (!XMLObject)  return;

  if (nObjects>=nAlloc)  {
    nAlloc += lenInc;
    obj1 = new PCXMLObject[nAlloc];
    for (i=0;i<nObjects;i++)
      obj1[i] = object[i];
    for (i=nObjects;i<nAlloc;i++)
      obj1[i] = NULL;
    if (object)  delete[] object;
    object = obj1;
  }

  if (object[nObjects])  delete object[nObjects];
  object[nObjects] = XMLObject;
  nObjects++;

}

int  CXMLObject::WriteObject ( cpstr FName, int pos, int indent )  {
CFile f;
  f.assign ( FName,True );
  if (f.rewrite())  {
    WriteObject ( f,pos,indent );
    f.shut();
    return 0;
  }
  return 1;
}

void  CXMLObject::WriteObject ( RCFile f, int pos, int indent )  {
int     i,pos1,lm,rm,tl;
pstr    indstr,p,p1,q;
Boolean sngline;

  if (objTag)  {

    pos1   = pos + indent;
    indstr = new char[pos1+1];
    for (i=0;i<pos1;i++)  indstr[i] = ' ';
    indstr[pos1] = char(0);

    indstr[pos]  = char(0);
    f.Write ( indstr    );
    f.Write ( pstr("<") );
    f.Write ( objTag    );
    if ((!objData) && (nObjects<=0))  {
      f.WriteLine ( pstr("/>") );
      delete[] indstr;
      return;
    }
    f.Write ( pstr(">") );

    sngline = False;
    if (objData)  {
      rm = 72;               // right margin
      lm = IMin ( pos1,36 ); // left margin
      tl = strlen(objTag);
      if ((pos+tl+2+strlen(objData)<rm-tl-2) &&
          (nObjects<=0))  {
        // single-line output
        sngline = True;
        f.Write ( objData );
      } else  {
        // multiple-line output with indentation
        indstr[pos] = ' ';
        indstr[lm]  = char(0);
        f.LF();
        p = objData;
        do  {
          p1 = p;
          i  = lm;
          q  = NULL;
          while ((*p1) && ((i<rm) || (!q)))  {
            if (*p1==' ')  q = p1;
            p1++;
            i++;
          }
          f.Write ( indstr );
          if (*p1)  {  // wrap data
            *q = char(0);
            f.WriteLine ( p );
            *q = ' ';
            p  = q;
            while (*p==' ')  p++;
            if (*p==char(0))  p = NULL;

          } else {  // data exchausted
            f.WriteLine ( p );
            p = NULL;
          }
        } while (p);
        indstr[lm]  = ' ';
        indstr[pos] = char(0);
      }
    } else
      f.LF();

    for (i=0;i<nObjects;i++)
      if (object[i])
        object[i]->WriteObject ( f,pos+indent,indent );

    if (!sngline)  f.Write ( indstr );
    f.Write ( pstr("</") );
    f.Write ( objTag  );
    f.WriteLine ( pstr(">") );

    delete[] indstr;

  }

}


int  CXMLObject::ReadObject ( cpstr FName )  {
CFile f;
char  S[500];
int   i,rc;

  f.assign ( FName,True );
  if (f.reset(True))  {
    S[0] = char(0);
    i    = 0;
    rc   = ReadObject ( f,S,i,sizeof(S) );
    f.shut();
  } else
    rc = XMLR_NoFile;

  if (rc)  FreeMemory();

  return rc;

}

int  CXMLObject::ReadObject ( RCFile f, pstr S, int & pos, int slen )  {
PCXMLObject XMLObject;
pstr        S1;
int         k,k1,k2,rc;
Boolean     Done;

  FreeMemory();

  rc = XMLR_Ok;

  k1 = -1;
  while ((!f.FileEnd()) && (k1<0))  {
    k = strlen(S);
    while ((pos<k) && (k1<0))
      if (S[pos]=='<')  {
        if (S[pos+1]=='?') // in this version, ignore <?xxx ?>
                           //   constructions
             pos++;
        else if (S[pos+1]!='<')
             k1 = pos;
        else pos += 2;
      } else
        pos++;
    if (k1>=0)  {
      k2 = -1;
      while ((pos<k) && (k2<0))
        if (S[pos]=='>')  {
          if (S[pos+1]!='>')  k2 = pos;
                        else  pos += 2;
        } else
          pos++;
      if (k2<0)  rc = XMLR_BrokenTag;
    }
    if (k1<0)  {
      f.ReadLine ( S,slen );
      pos = 0;
    }
  }

  if (k1<0)        return XMLR_NoTag;
  if (rc!=XMLR_Ok) return rc;

  pos++;
  if (S[k2-1]=='/')  {  // <Tag/>
    S[k2-1] = char(0);
    CreateCopy ( objTag,&(S[k1+1]) );
    return XMLR_Ok;
  }

  S[k2] = char(0);
  CreateCopy ( objTag,&(S[k1+1]) );
  S[k2] = '>';

  S1   = new char[slen+1];
  Done = False;
  while ((!f.FileEnd()) && (!Done))  {
    k = strlen(S);
    while ((pos<k) && (!Done))  {
      k1 = pos;
      k2 = -1;
      while ((pos<k) && (k2<0))
        if (S[pos]=='<')  {
          if (S[pos+1]!='<')  k2 = pos;
                        else  pos +=2;
        } else
          pos++;
      if (k2>=0)  S[k2] = char(0);
      strcpy_des   ( S1,&(S[k1]) );
      if (S1[0])  {
        if (objData)  CreateConcat ( objData,pstr(" "),S1 );
                else  CreateConcat ( objData,S1 );
      }
      if (k2>=0)  {
        S[k2] = '<';
        if (S[k2+1]!='/')  {
          XMLObject = new CXMLObject();
          AddObject ( XMLObject );
          rc   = XMLObject->ReadObject ( f,S,pos,slen );
          Done = (rc!=XMLR_Ok);
        } else  {
          Done = True;
          k1   = k2+2;
          k2   = -1;
          while ((pos<k) && (k2<0))
            if (S[pos]=='>')  {
              if (S[pos+1]!='>')  k2 = pos;
                            else  pos += 2;
              } else
                pos++;
          if (k2<0)
            rc = XMLR_BrokenTag;
          else  {
            S[k2] = char(0);
            if (strcmp(objTag,&(S[k1])))  rc = XMLR_UnclosedTag;
                                    else  pos++;
          }
        }
      }
    }
    if (!Done)  {
      f.ReadLine ( S,slen );
      pos = 0;
    }
  }

  delete[] S1;

  // this keeps pairs <tag></tag> instead of replacing them for <tag/>
  // on output
  if ((!objData) && (nObjects<=0))
    CreateCopy ( objData,pstr("") );

  if (rc!=XMLR_Ok)  FreeMemory();
  return rc;
   
}


void  CXMLObject::Copy ( PCXMLObject XMLObject )  {
int i;
  FreeMemory();
  CreateCopy ( objTag ,XMLObject->objTag  );
  CreateCopy ( objData,XMLObject->objData );
  nObjects = XMLObject->nObjects;
  nAlloc   = nObjects;
  if (nObjects>0)  {
    object = new PCXMLObject[nObjects];
    for (i=0;i<nObjects;i++)
      if (XMLObject->object[i])  {
        object[i] = new CXMLObject();
        object[i]->Copy ( XMLObject->object[i] );
      } else
        object[i] = NULL;
  }
}


void  CXMLObject::write ( RCFile f )  {
int i;
  f.CreateWrite ( objTag    );
  f.CreateWrite ( objData   );
  f.WriteInt    ( &nObjects );
  for (i=0;i<nObjects;i++)
    StreamWrite ( f,object[i] );
}

void  CXMLObject::read ( RCFile f )  {
int i;
  FreeMemory();
  f.CreateRead ( objTag    );
  f.CreateRead ( objData   );
  f.ReadInt    ( &nObjects );
  nAlloc = nObjects;
  if (nObjects>0)  {
    object = new PCXMLObject[nObjects];
    for (i=0;i<nObjects;i++)  {
      object[i] = NULL;
      StreamRead ( f,object[i] );
    }
  }
}


MakeStreamFunctions(CXMLObject)



PCXMLObject mmCIF2XML ( PCMMCIFData mmCIFData, int * rc )  {
PCXMLObject XMLObject;
pstr        dataName;
int         k;
  XMLObject = NULL;
  if (rc) *rc = -2;
  if (mmCIFData)  {
    dataName = mmCIFData->GetDataName();
    if (dataName)  {
      if (dataName[0])
        XMLObject = new CXMLObject ( dataName );
    }
    if (!XMLObject)
      XMLObject = new CXMLObject ( pstr("no_data_name") );
    k = XMLObject->AddMMCIFData ( mmCIFData );
    if (rc)  *rc = k;
  }
  return XMLObject;
}

PCXMLObject mmCIF2XML ( cpstr XMLName, PCMMCIFFile mmCIFFile,
                        int * rc )  {
PCXMLObject XMLObject1,XMLObject2;
PCMMCIFData mmCIFData;
int         nData,i,k,rc1;
  XMLObject1 = new CXMLObject ( XMLName );
  if (rc) *rc = -1;
  if (mmCIFFile)  {
    nData = mmCIFFile->GetNofData();
    k   = 0;
    rc1 = 0;
    for (i=0;(i<nData) && (rc1>=0);i++)  {
      mmCIFData = mmCIFFile->GetCIFData ( i );
      if (mmCIFData)  {
        XMLObject2 = mmCIF2XML ( mmCIFData,&rc1 );
        if (XMLObject2)  {
          if (rc1>=0)  {
            XMLObject1->AddObject ( XMLObject2 );
            k += rc1;
          } else
            delete XMLObject2;
        }
      }
    }
    if (rc1<0)  {
      delete XMLObject1;
      if (rc)  *rc = -2;
    } else if (rc)
      *rc = k;
  }
  return XMLObject1;
}

