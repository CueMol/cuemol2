include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(MOLANL_SRCS
molanl.cpp
MolAnlManager.cpp
LsqFit.cpp
ContactMap.cpp
#
# mmdb/ssmlib files
#
mmdb/bfgs_min.cpp
mmdb/file_.cpp
mmdb/hybrid_36.cpp
mmdb/linalg_.cpp
mmdb/machine_.cpp
mmdb/math_.cpp
mmdb/mattype_.cpp
mmdb/mmdb_align.cpp
mmdb/mmdb_atom.cpp
mmdb/mmdb_bondmngr.cpp
mmdb/mmdb_chain.cpp
mmdb/mmdb_cifdefs.cpp
mmdb/mmdb_coormngr.cpp
mmdb/mmdb_cryst.cpp
mmdb/mmdb_ficif.cpp
mmdb/mmdb_file.cpp
mmdb/mmdb_graph.cpp
mmdb/mmdb_manager.cpp
mmdb/mmdb_mask.cpp
mmdb/mmdb_mmcif.cpp
mmdb/mmdb_model.cpp
mmdb/mmdb_rwbrook.cpp
mmdb/mmdb_sbase.cpp
mmdb/mmdb_sbase0.cpp
mmdb/mmdb_selmngr.cpp
mmdb/mmdb_symop.cpp
mmdb/mmdb_tables.cpp
mmdb/mmdb_title.cpp
mmdb/mmdb_uddata.cpp
mmdb/mmdb_utils.cpp
mmdb/mmdb_xml.cpp
mmdb/random_n.cpp
mmdb/stream_.cpp
#
ssmlib/ss_csia.cpp
ssmlib/ss_graph.cpp
ssmlib/ss_vxedge.cpp
ssmlib/ssm_align.cpp
ssmlib/ssm_superpose.cpp
#
# MINPACK_SRC
#
minpack/lmdif.cpp
minpack/fdjac2.cpp 
minpack/enorm.cpp
minpack/qrfac.cpp
minpack/lmpar.cpp
minpack/dpmpar.cpp
minpack/qrsolv.cpp
minpack/LMMinimizer.cpp
)

##########
# CueMol interface definitions for MCWRAPGEN

SET(MOLANL_MCWG_QIFS
MolAnlManager.qif
  )

# module loader generated by MCWG
SET(MOLANL_MODLDR_SRC molanl.moddef)

MCWRAPGEN_CLASS(MOLANL_SRCS ${MOLANL_MCWG_QIFS})
MCWRAPGEN_MODULE(MOLANL_SRCS ${MOLANL_MODLDR_SRC} ${MOLANL_MCWG_QIFS})

# add_library(molanl SHARED ${MOLANL_SRCS} ${MCWG_HEADERS})
add_library(molanl STATIC ${MOLANL_SRCS} ${MCWG_HEADERS})

if (WIN32)
  add_definitions(-DMOLANL_EXPORTS=1)
  add_definitions(-D_MVS)
else()
  target_compile_options(molanl PUBLIC "-fPIC")
endif()

target_link_libraries(molanl PRIVATE qlib gfx qsys molstr)

MCWRAPGEN_SCR_WRAPPERS(molanl)

install(TARGETS molanl
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )
