//  $Id: mmdb_cifdefs.h,v 1.1 2010/01/23 14:25:04 rishitani Exp $
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
//    02.01.00   <--  Date of Last Modification.
//                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  -----------------------------------------------------------------
//
//  **** Module  :   MMDBF_Defs <interface>
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
#define __MMDB_CIFDefs__

#ifndef  __MatType__
#include "mattype_.h"
#endif

// ------------------------------------------------------------------

//  Mode IDs

#define CIF_NDB   0
#define CIF_PDBX  1


//  CIF IDs for mode-dependent CIF names


#define CAT_POLY_SEQ_SCHEME              1

#define TAG_CHAIN_ID                   101
#define TAG_DB_ACCESSION               102
#define TAG_DB_ALIGN_BEG               103
#define TAG_DB_ALIGN_BEG_INS_CODE      104
#define TAG_DB_ALIGN_END               105
#define TAG_DB_ALIGN_END_INS_CODE      106
#define TAG_ID_CODE                    107
#define TAG_SEQ_CHAIN_ID               108
#define TAG_SEQ_ALIGN_BEG              109
#define TAG_SEQ_ALIGN_BEG_INS_CODE     110
#define TAG_SEQ_ALIGN_END              111
#define TAG_SEQ_ALIGN_END_INS_CODE     112

//  CIFName(..) gives CIF name according to CIF Mode.
extern pstr CIFName ( int NameID, int Mode );

// ------------------------------------------------------------------


#define CIFCAT_ATOM_SITE                   pstr("_atom_site")
#define CIFCAT_ATOM_SITE_ANISOTROP         pstr("_atom_site_anisotrop")
#define CIFCAT_ATOM_SITES                  pstr("_atom_sites")
#define CIFCAT_AUDIT_AUTHOR                pstr("_audit_author")
#define CIFCAT_CELL                        pstr("_cell")
#define CIFCAT_CHEM_COMP                   pstr("_chem_comp")
#define CIFCAT_CITATION                    pstr("_citation")
#define CIFCAT_DATABASE                    pstr("_database")
#define CIFCAT_DATABASE_PDB_CAVEAT         pstr("_database_pdb_caveat")
#define CIFCAT_DATABASE_PDB_MATRIX         pstr("_database_pdb_matrix")
#define CIFCAT_DATABASE_PDB_REV            pstr("_database_pdb_rev")
#define CIFCAT_DATABASE_PDB_TVECT          pstr("_database_pdb_tvect")
#define CIFCAT_ENTITY                      pstr("_entity")
#define CIFCAT_EXPTL                       pstr("_exptl")
#define CIFCAT_NDB_DATABASE_REMARK         pstr("_ndb_database_remark")
#define CIFCAT_NDB_NONSTANDARD_LIST        pstr("_ndb_nonstandard_list")
#define CIFCAT_NDB_POLY_SEQ_SCHEME         pstr("_ndb_poly_seq_scheme")
#define CIFCAT_PDBX_POLY_SEQ_SCHEME        pstr("_pdbx_poly_seq_scheme")
#define CIFCAT_SPRSDE                      pstr("_ndb_database_pdb_obs_spr")
#define CIFCAT_STRUCT                      pstr("_struct")
#define CIFCAT_STRUCT_ASYM                 pstr("_struct_asym")
#define CIFCAT_STRUCT_CONF                 pstr("_struct_conf")
#define CIFCAT_STRUCT_CONN                 pstr("_struct_conn")
#define CIFCAT_STRUCT_KEYWORDS             pstr("_struct_keywords")
#define CIFCAT_STRUCT_NCS_OPER             pstr("_struct_ncs_oper")
#define CIFCAT_STRUCT_REF                  pstr("_struct_ref")
#define CIFCAT_STRUCT_REF_SEQ              pstr("_struct_ref_seq")
#define CIFCAT_STRUCT_REF_SEQ_DIF          pstr("_struct_ref_seq_dif")
#define CIFCAT_STRUCT_SHEET                pstr("_struct_sheet")
#define CIFCAT_STRUCT_SHEET_RANGE          pstr("_struct_sheet_range")
#define CIFCAT_STRUCT_SHEET_ORDER          pstr("_struct_sheet_order")
#define CIFCAT_STRUCT_SHEET_HBOND          pstr("_struct_sheet_hbond")
#define CIFCAT_SYMMETRY                    pstr("_symmetry")
#define CIFCAT_OBSLTE                      pstr("_ndb_database_pdb_obs_spr")

                                                                       
#define CIFTAG_ANGLE_ALPHA                    pstr("angle_alpha")
#define CIFTAG_ANGLE_BETA                     pstr("angle_beta")
#define CIFTAG_ANGLE_GAMMA                    pstr("angle_gamma")
#define CIFTAG_ASYM_ID                        pstr("asym_id")
#define CIFTAG_ATOM_TYPE_SYMBOL               pstr("atom_type_symbol")
#define CIFTAG_AUTH_ASYM_ID                   pstr("auth_asym_id")
#define CIFTAG_AUTH_ATOM_ID                   pstr("auth_atom_id")
#define CIFTAG_AUTH_COMP_ID                   pstr("auth_comp_id")
#define CIFTAG_AUTH_SEQ_ID                    pstr("auth_seq_id")
#define CIFTAG_B_ISO_OR_EQUIV                 pstr("B_iso_or_equiv")
#define CIFTAG_B_ISO_OR_EQUIV_ESD             pstr("B_iso_or_equiv_esd")
#define CIFTAG_BEG_LABEL_ASYM_ID              pstr("beg_label_asym_id")
#define CIFTAG_BEG_LABEL_COMP_ID              pstr("beg_label_comp_id")
#define CIFTAG_BEG_LABEL_SEQ_ID               pstr("beg_label_seq_id")
#define CIFTAG_CARTN_X                        pstr("cartn_x")
#define CIFTAG_CARTN_X_ESD                    pstr("cartn_x_esd")
#define CIFTAG_CARTN_Y                        pstr("cartn_y")
#define CIFTAG_CARTN_Y_ESD                    pstr("cartn_y_esd")
#define CIFTAG_CARTN_Z                        pstr("cartn_z")
#define CIFTAG_CARTN_Z_ESD                    pstr("cartn_z_esd")
#define CIFTAG_CHARGE                         pstr("charge")
#define CIFTAG_CODE                           pstr("code")
#define CIFTAG_CODE_NDB                       pstr("code_NDB")
#define CIFTAG_CODE_PDB                       pstr("code_PDB")
#define CIFTAG_CONF_TYPE_ID                   pstr("conf_type_id")
#define CIFTAG_CONN_TYPE_ID                   pstr("conn_type_id")
#define CIFTAG_DATE                           pstr("date")
#define CIFTAG_DATE_ORIGINAL                  pstr("date_original")
#define CIFTAG_DB_ALIGN_BEG                   pstr("db_align_beg")
#define CIFTAG_DB_ALIGN_END                   pstr("db_align_end")
#define CIFTAG_DB_CODE                        pstr("db_code")
#define CIFTAG_DB_MON_ID                      pstr("db_mon_id")
#define CIFTAG_DB_NAME                        pstr("db_name")
#define CIFTAG_DETAILS                        pstr("details")
#define CIFTAG_END_LABEL_ASYM_ID              pstr("end_label_asym_id")
#define CIFTAG_END_LABEL_COMP_ID              pstr("end_label_comp_id")
#define CIFTAG_END_LABEL_SEQ_ID               pstr("end_label_seq_id")
#define CIFTAG_ENTITY_ID                      pstr("entity_id")
#define CIFTAG_ENTRY_ID                       pstr("entry_id")
#define CIFTAG_FORMULA                        pstr("formula")
#define CIFTAG_FRACT_TRANSF_MATRIX11          pstr("fract_transf_matrix[1][1]")
#define CIFTAG_FRACT_TRANSF_MATRIX12          pstr("fract_transf_matrix[1][2]")
#define CIFTAG_FRACT_TRANSF_MATRIX13          pstr("fract_transf_matrix[1][3]")
#define CIFTAG_FRACT_TRANSF_MATRIX21          pstr("fract_transf_matrix[2][1]")
#define CIFTAG_FRACT_TRANSF_MATRIX22          pstr("fract_transf_matrix[2][2]")
#define CIFTAG_FRACT_TRANSF_MATRIX23          pstr("fract_transf_matrix[2][3]")
#define CIFTAG_FRACT_TRANSF_MATRIX31          pstr("fract_transf_matrix[3][1]")
#define CIFTAG_FRACT_TRANSF_MATRIX32          pstr("fract_transf_matrix[3][2]")
#define CIFTAG_FRACT_TRANSF_MATRIX33          pstr("fract_transf_matrix[3][3]")
#define CIFTAG_FRACT_TRANSF_VECTOR1           pstr("fract_transf_vector[1]")
#define CIFTAG_FRACT_TRANSF_VECTOR2           pstr("fract_transf_vector[2]")
#define CIFTAG_FRACT_TRANSF_VECTOR3           pstr("fract_transf_vector[3]")
#define CIFTAG_GROUP_PDB                      pstr("group_PDB" )
#define CIFTAG_ID                             pstr("id")
#define CIFTAG_INS_CODE                       pstr("ins_code")
#define CIFTAG_LABEL_ALT_ID                   pstr("label_alt_id")
#define CIFTAG_LABEL_ATOM_ID                  pstr("label_atom_id")
#define CIFTAG_LABEL_ASYM_ID                  pstr("label_asym_id")
#define CIFTAG_LABEL_COMP_ID                  pstr("label_comp_id")
#define CIFTAG_LABEL_ENTITY_ID                pstr("label_entity_id")
#define CIFTAG_LABEL_SEQ_ID                   pstr("label_seq_id")
#define CIFTAG_LENGTH_A                       pstr("length_a")
#define CIFTAG_LENGTH_B                       pstr("length_b")
#define CIFTAG_LENGTH_C                       pstr("length_c")
#define CIFTAG_MATRIX11                       pstr("matrix[1][1]")
#define CIFTAG_MATRIX12                       pstr("matrix[1][2]")
#define CIFTAG_MATRIX13                       pstr("matrix[1][3]")
#define CIFTAG_MATRIX21                       pstr("matrix[2][1]")
#define CIFTAG_MATRIX22                       pstr("matrix[2][2]")
#define CIFTAG_MATRIX23                       pstr("matrix[2][3]")
#define CIFTAG_MATRIX31                       pstr("matrix[3][1]")
#define CIFTAG_MATRIX32                       pstr("matrix[3][2]")
#define CIFTAG_MATRIX33                       pstr("matrix[3][3]")
#define CIFTAG_METHOD                         pstr("method")
#define CIFTAG_MOD_TYPE                       pstr("mod_type")
#define CIFTAG_MON_ID                         pstr("mon_id")
#define CIFTAG_NAME                           pstr("name")
#define CIFTAG_NDB_BEG_LABEL_INS_CODE_PDB     pstr("ndb_beg_label_ins_code_pdb")
#define CIFTAG_NDB_CHAIN_ID                   pstr("ndb_chain_id")
#define CIFTAG_NDB_COMPONENT_NO               pstr("ndb_component_no")
#define CIFTAG_NDB_DESCRIPTOR                 pstr("ndb_descriptor")
#define CIFTAG_NDB_DB_ACCESSION               pstr("ndb_db_accession")
#define CIFTAG_NDB_DB_ALIGN_BEG_INS_CODE      pstr("ndb_db_align_beg_ins_code")
#define CIFTAG_NDB_DB_ALIGN_END_INS_CODE      pstr("ndb_db_align_end_ins_code")
#define CIFTAG_NDB_END_LABEL_INS_CODE_PDB     pstr("ndb_end_label_ins_code_pdb")
#define CIFTAG_NDB_INS_CODE                   pstr("ndb_ins_code")
#define CIFTAG_NDB_HELIX_CLASS_PDB            pstr("ndb_helix_class_pdb")
#define CIFTAG_NDB_KEYWORDS                   pstr("ndb_keywords")
#define CIFTAG_NDB_LABEL_ALT_ID               pstr("ndb_label_alt_id")
#define CIFTAG_NDB_LABEL_ATOM_ID              pstr("ndb_label_atom_id")
#define CIFTAG_NDB_LABEL_ASYM_ID              pstr("ndb_label_asym_id")
#define CIFTAG_NDB_LABEL_COMP_ID              pstr("ndb_label_comp_id")
#define CIFTAG_NDB_LABEL_INS_CODE             pstr("ndb_label_ins_code")
#define CIFTAG_NDB_LABEL_SEQ_NUM              pstr("ndb_label_seq_num")
#define CIFTAG_NDB_LENGTH                     pstr("ndb_length")
#define CIFTAG_NDB_MODEL                      pstr("ndb_model")
#define CIFTAG_NDB_PDB_CHAIN_ID               pstr("ndb_pdb_chain_id")
#define CIFTAG_NDB_PDB_ID                     pstr("ndb_pdb_id")
#define CIFTAG_NDB_PDB_ID_CODE                pstr("ndb_pdb_id_code")
#define CIFTAG_NDB_PDB_INS_CODE               pstr("ndb_pdb_ins_code")
#define CIFTAG_NDB_PTNR1_LABEL_INS_CODE       pstr("ndb_ptnr1_label_ins_code")
#define CIFTAG_NDB_PTNR1_STANDARD_COMP_ID     pstr("ndb_ptnr1_standard_comp_id")
#define CIFTAG_NDB_RANGE_1_BEG_LABEL_COMP_ID  pstr("ndb_range_1_beg_label_comp_id")
#define CIFTAG_NDB_RANGE_1_BEG_LABEL_ASYM_ID  pstr("ndb_range_1_beg_label_asym_id")
#define CIFTAG_NDB_RANGE_1_BEG_LABEL_INS_CODE pstr("ndb_range_1_beg_label_ins_code")
#define CIFTAG_NDB_RANGE_1_END_LABEL_COMP_ID  pstr("ndb_range_1_end_label_comp_id")
#define CIFTAG_NDB_RANGE_1_END_LABEL_ASYM_ID  pstr("ndb_range_1_end_label_asym_id")
#define CIFTAG_NDB_RANGE_1_END_LABEL_INS_CODE pstr("ndb_range_1_end_label_ins_code")
#define CIFTAG_NDB_SEQ_ALIGN_BEG              pstr("ndb_seq_align_beg")
#define CIFTAG_NDB_SEQ_ALIGN_BEG_INS_CODE     pstr("ndb_seq_align_beg_ins_code")
#define CIFTAG_NDB_SEQ_ALIGN_END              pstr("ndb_seq_align_end")
#define CIFTAG_NDB_SEQ_ALIGN_END_INS_CODE     pstr("ndb_seq_align_end_ins_code")
#define CIFTAG_NDB_SEQ_DB_NAME                pstr("ndb_seq_db_name")
#define CIFTAG_NDB_SEQ_DB_ACCESSION_CODE      pstr("ndb_seq_db_accession_code")
#define CIFTAG_NDB_SEQ_DB_SEQ_NUM             pstr("ndb_seq_db_seq_num")
#define CIFTAG_NDB_SYNONYMS                   pstr("ndb_synonyms")
#define CIFTAG_NUM                            pstr("num")
#define CIFTAG_NUMBER_ATOMS_NH                pstr("number_atoms_nh")
#define CIFTAG_NUMBER_STRANDS                 pstr("number_strands")
#define CIFTAG_OCCUPANCY                      pstr("occupancy")
#define CIFTAG_OCCUPANCY_ESD                  pstr("occupancy_esd")
#define CIFTAG_ORIGX11                        pstr("origx[1][1]")
#define CIFTAG_ORIGX12                        pstr("origx[1][2]")
#define CIFTAG_ORIGX13                        pstr("origx[1][3]")
#define CIFTAG_ORIGX21                        pstr("origx[2][1]")
#define CIFTAG_ORIGX22                        pstr("origx[2][2]")
#define CIFTAG_ORIGX23                        pstr("origx[2][3]")
#define CIFTAG_ORIGX31                        pstr("origx[3][1]")
#define CIFTAG_ORIGX32                        pstr("origx[3][2]")
#define CIFTAG_ORIGX33                        pstr("origx[3][3]")
#define CIFTAG_ORIGX_VECTOR1                  pstr("origx_vector[1]")
#define CIFTAG_ORIGX_VECTOR2                  pstr("origx_vector[2]")
#define CIFTAG_ORIGX_VECTOR3                  pstr("origx_vector[3]")
#define CIFTAG_PDB_ID                         pstr("pdb_id")
#define CIFTAG_PDB_MON_ID                     pstr("pdb_mon_id")
#define CIFTAG_PDB_STRAND_ID                  pstr("pdb_strand_id")
#define CIFTAG_PDBX_DB_ACCESSION              pstr("pdbx_db_accession")
#define CIFTAG_PDBX_DB_ALIGN_BEG_INS_CODE     pstr("pdbx_db_align_beg_ins_code")
#define CIFTAG_PDBX_DB_ALIGN_END_INS_CODE     pstr("pdbx_db_align_end_ins_code")
#define CIFTAG_PDBX_PDB_ID_CODE               pstr("pdbx_PDB_id_code")
#define CIFTAG_PDBX_PDB_INS_CODE              pstr("pdbx_PDB_ins_code")
#define CIFTAG_PDBX_PDB_MODEL_NUM             pstr("pdbx_PDB_model_num")
#define CIFTAG_PDBX_STRAND_ID                 pstr("pdbx_strand_id")
#define CIFTAG_RANGE_1_BEG_LABEL_ATOM_ID      pstr("range_1_beg_label_atom_id")
#define CIFTAG_RANGE_1_BEG_LABEL_SEQ_ID       pstr("range_1_beg_label_seq_id")
#define CIFTAG_RANGE_1_END_LABEL_ATOM_ID      pstr("range_1_end_label_atom_id")
#define CIFTAG_RANGE_1_END_LABEL_SEQ_ID       pstr("range_1_end_label_seq_id")
#define CIFTAG_RANGE_ID_1                     pstr("range_id_1")
#define CIFTAG_RANGE_ID_2                     pstr("range_id_2")
#define CIFTAG_RCSB_RECORD_REVISED_1          pstr("rcsb_record_revised_1")
#define CIFTAG_RCSB_RECORD_REVISED_2          pstr("rcsb_record_revised_2")
#define CIFTAG_RCSB_RECORD_REVISED_3          pstr("rcsb_record_revised_3")
#define CIFTAG_RCSB_RECORD_REVISED_4          pstr("rcsb_record_revised_4")
#define CIFTAG_PDBX_SEQ_ALIGN_BEG_INS_CODE    pstr("pdbx_seq_align_beg_ins_code")
#define CIFTAG_PDBX_SEQ_ALIGN_END_INS_CODE    pstr("pdbx_seq_align_end_ins_code")
#define CIFTAG_PTNR1_LABEL_ASYM_ID            pstr("ptnr1_label_asym_id")
#define CIFTAG_PTNR1_LABEL_COMP_ID            pstr("ptnr1_label_comp_id")
#define CIFTAG_PTNR1_LABEL_SEQ_ID             pstr("ptnr1_label_seq_id")
#define CIFTAG_REF_ID                         pstr("ref_id")
#define CIFTAG_REPLACES                       pstr("replaces")
#define CIFTAG_REPLACE_PDB_ID                 pstr("replace_pdb_id")
#define CIFTAG_SEGMENT_ID                     pstr("segment_id")
#define CIFTAG_SEQ_ALIGN_BEG                  pstr("seq_align_beg")
#define CIFTAG_SEQ_ALIGN_END                  pstr("seq_align_end")
#define CIFTAG_SEQ_NUM                        pstr("seq_num")
#define CIFTAG_SENSE                          pstr("sense")
#define CIFTAG_SHEET_ID                       pstr("sheet_id")
#define CIFTAG_SOURCE                         pstr("source")
#define CIFTAG_SPACE_GROUP_NAME_H_M           pstr("space_group_name_h-m")
#define CIFTAG_TEXT                           pstr("text")
#define CIFTAG_TITLE                          pstr("title")
#define CIFTAG_TYPE                           pstr("type")
#define CIFTAG_TYPE_SYMBOL                    pstr("type_symbol")
#define CIFTAG_VECTOR1                        pstr("vector[1]")
#define CIFTAG_VECTOR2                        pstr("vector[2]")
#define CIFTAG_VECTOR3                        pstr("vector[3]")
#define CIFTAG_U11                            pstr("u[1][1]")
#define CIFTAG_U11_ESD                        pstr("u[1][1]_esd")
#define CIFTAG_U12                            pstr("u[1][2]")
#define CIFTAG_U12_ESD                        pstr("u[1][2]_esd")
#define CIFTAG_U13                            pstr("u[1][3]")
#define CIFTAG_U13_ESD                        pstr("u[1][3]_esd")
#define CIFTAG_U22                            pstr("u[2][2]")
#define CIFTAG_U22_ESD                        pstr("u[2][2]_esd")
#define CIFTAG_U23                            pstr("u[2][3]")
#define CIFTAG_U23_ESD                        pstr("u[2][3]_esd")
#define CIFTAG_U33                            pstr("u[3][3]")
#define CIFTAG_U33_ESD                        pstr("u[3][3]_esd")
#define CIFTAG_Z_PDB                          pstr("z_pdb")

#define CIFTAG_CONN_PTNR1_AUTH_ATOM_ID        pstr("ptnr1_auth_atom_id")
#define CIFTAG_CONN_PDBX_PTNR1_AUTH_ALT_ID    pstr("pdbx_ptnr1_auth_alt_id")
#define CIFTAG_CONN_PTNR1_AUTH_COMP_ID        pstr("ptnr1_auth_comp_id")
#define CIFTAG_CONN_PTNR1_AUTH_ASYM_ID        pstr("ptnr1_auth_asym_id")
#define CIFTAG_CONN_PTNR1_AUTH_SEQ_ID         pstr("ptnr1_auth_seq_id")
#define CIFTAG_CONN_PDBX_PTNR1_PDB_INS_CODE   pstr("pdbx_ptnr1_PDB_ins_code")
#define CIFTAG_CONN_PTNR2_AUTH_ATOM_ID        pstr("ptnr2_auth_atom_id")
#define CIFTAG_CONN_PDBX_PTNR2_AUTH_ALT_ID    pstr("pdbx_ptnr2_auth_alt_id")
#define CIFTAG_CONN_PTNR2_AUTH_COMP_ID        pstr("ptnr2_auth_comp_id")
#define CIFTAG_CONN_PTNR2_AUTH_ASYM_ID        pstr("ptnr2_auth_asym_id")
#define CIFTAG_CONN_PTNR2_AUTH_SEQ_ID         pstr("ptnr2_auth_seq_id")
#define CIFTAG_CONN_PDBX_PTNR2_PDB_INS_CODE   pstr("pdbx_ptnr2_PDB_ins_code")
#define CIFTAG_CONN_PTNR1_SYMMETRY            pstr("ptnr1_symmetry")
#define CIFTAG_CONN_PTNR2_SYMMETRY            pstr("ptnr2_symmetry")


#endif

