//  $Id: mmdb_cifdefs.cpp,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    08.12.00   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :   MMDBF_Defs <implementation>
//       ~~~~~~~~~
//  **** Project :   MacroMolecular Data Base (MMDB)
//       ~~~~~~~~~
//
//      CIF Definitions
//
//  (C) E. Krissinel 2000-2008
//
//  =================================================================
//

#ifndef __MMDB_CIFDefs__
#include "mmdb_cifdefs.h"
#endif


// ------------------------------------------------------------------

pstr CIFName ( int NameID, int Mode )  {
//  Gives CIF name according to CIF Mode.

  switch (Mode)  {

    case CIF_NDB :

      switch (NameID)  {
        case CAT_POLY_SEQ_SCHEME        :
                  return CIFCAT_NDB_POLY_SEQ_SCHEME;
        case TAG_ID_CODE                :
                  return CIFTAG_NDB_PDB_ID_CODE;
        case TAG_CHAIN_ID               :
                  return CIFTAG_NDB_CHAIN_ID;
        case TAG_SEQ_ALIGN_BEG          :
                  return CIFTAG_SEQ_ALIGN_BEG;
        case TAG_SEQ_ALIGN_BEG_INS_CODE :
                  return CIFTAG_NDB_SEQ_ALIGN_BEG_INS_CODE;
        case TAG_SEQ_ALIGN_END          :
                  return CIFTAG_SEQ_ALIGN_END;
        case TAG_SEQ_ALIGN_END_INS_CODE :
                  return CIFTAG_NDB_SEQ_ALIGN_END_INS_CODE;
        case TAG_DB_ACCESSION           :
                  return CIFTAG_NDB_DB_ACCESSION;
        case TAG_DB_ALIGN_BEG           :
                  return CIFTAG_DB_ALIGN_BEG;
        case TAG_DB_ALIGN_BEG_INS_CODE  :
                  return CIFTAG_NDB_DB_ALIGN_BEG_INS_CODE;
        case TAG_DB_ALIGN_END           :
                  return CIFTAG_DB_ALIGN_END;
        case TAG_DB_ALIGN_END_INS_CODE  :
                  return CIFTAG_NDB_DB_ALIGN_END_INS_CODE;
        case TAG_SEQ_CHAIN_ID           :
                  return CIFTAG_ID;
        default : return pstr("ERROR_IN_CIF_NAME_1");
      }

    case CIF_PDBX :

      switch (NameID)  {
        case CAT_POLY_SEQ_SCHEME        :
                  return CIFCAT_PDBX_POLY_SEQ_SCHEME;
        case TAG_ID_CODE                :
                  return CIFTAG_PDBX_PDB_ID_CODE;
        case TAG_CHAIN_ID               :
                  return CIFTAG_PDBX_STRAND_ID;
        case TAG_SEQ_ALIGN_BEG          :
                  return CIFTAG_SEQ_ALIGN_BEG;
        case TAG_SEQ_ALIGN_BEG_INS_CODE :
                  return CIFTAG_PDBX_SEQ_ALIGN_BEG_INS_CODE;
        case TAG_SEQ_ALIGN_END          :
                  return CIFTAG_SEQ_ALIGN_END;
        case TAG_SEQ_ALIGN_END_INS_CODE :
                  return CIFTAG_PDBX_SEQ_ALIGN_END_INS_CODE;
        case TAG_DB_ACCESSION           :
                  return CIFTAG_PDBX_DB_ACCESSION;
        case TAG_DB_ALIGN_BEG           :
                  return CIFTAG_DB_ALIGN_BEG;
        case TAG_DB_ALIGN_BEG_INS_CODE  :
                  return CIFTAG_PDBX_DB_ALIGN_BEG_INS_CODE;
        case TAG_DB_ALIGN_END           :
                  return CIFTAG_DB_ALIGN_END;
        case TAG_DB_ALIGN_END_INS_CODE  :
                  return CIFTAG_PDBX_DB_ALIGN_END_INS_CODE;
        case TAG_SEQ_CHAIN_ID           :
                  return CIFTAG_ASYM_ID;
        default : return pstr("ERROR_IN_CIF_NAME_2");
      }

    default : return pstr("ERROR_IN_CIF_NAME_3");

  }

}

