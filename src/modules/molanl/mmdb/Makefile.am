
# AUTOMAKE_OPTIONS = foreign

lib_LTLIBRARIES = libmmdb.la

# Use library_includedir with library_include_HEADERS to put the headers in the 
# directory $(library_includedir) [Not well documented].

library_includedir=$(includedir)/mmdb

library_include_HEADERS = \
bfgs_min.h    mmdb_atom.h      mmdb_ficif.h    mmdb_rwbrook.h  mmdb_uddata.h \
file_.h       mmdb_bondmngr.h  mmdb_file.h     mmdb_sbase0.h   mmdb_utils.h  \
linalg_.h     mmdb_chain.h     mmdb_graph.h    mmdb_sbase.h    mmdb_xml.h    \
machine_.h    mmdb_cifdefs.h   mmdb_manager.h  mmdb_selmngr.h  random_n.h    \
math_.h       mmdb_coormngr.h  mmdb_mask.h     mmdb_symop.h    stream_.h     \
mattype_.h    mmdb_cryst.h     mmdb_mmcif.h    mmdb_tables.h                 \
mmdb_align.h  mmdb_defs.h      mmdb_model.h    mmdb_title.h    hybrid_36.h


libmmdb_la_SOURCES = \
bfgs_min.cpp	mmdb_bondmngr.cpp  mmdb_manager.cpp  mmdb_symop.cpp   \
file_.cpp	mmdb_chain.cpp	   mmdb_mask.cpp     mmdb_tables.cpp  \
linalg_.cpp	mmdb_cifdefs.cpp   mmdb_mmcif.cpp    mmdb_title.cpp   \
machine_.cpp	mmdb_coormngr.cpp  mmdb_model.cpp    mmdb_uddata.cpp  \
math_.cpp	mmdb_cryst.cpp	   mmdb_rwbrook.cpp  mmdb_utils.cpp   \
mattype_.cpp	mmdb_ficif.cpp	   mmdb_sbase0.cpp   mmdb_xml.cpp     \
mmdb_align.cpp	mmdb_file.cpp	   mmdb_sbase.cpp    random_n.cpp     \
mmdb_atom.cpp	mmdb_graph.cpp	   mmdb_selmngr.cpp  stream_.cpp      \
hybrid_36.cpp
