# Locate libMeshMS (the analytic SES molecular-surface backend) installed into
# the deplibs prefix by build_scripts (task install_meshms / build_meshms_posix)
# and expose it as the MeshMS::MeshMS imported target.
#
# Gated by the ENABLE_MESHMS option. The libcuemol2 build passes the config
# package location via -DMeshMS_DIR=<basedir>/meshms/lib/cmake/MeshMS. When
# MeshMS was built with oneTBB (the default), the generated MeshMSConfig.cmake
# runs find_dependency(TBB), which resolves through the -DTBB_DIR cache entry
# the build already passes -- the SAME bundled static oneTBB the rest of
# libcuemol2 (and umbreon/Embree) uses, keeping exactly one oneTBB runtime in
# the process.
#
# The consumer includes only <meshms/capi.hpp>, a C++17-clean facade; MeshMS
# itself is compiled as C++20 but does not force that onto its consumers.

find_package(MeshMS CONFIG REQUIRED)

message(STATUS "MeshMS found (static): ${MeshMS_VERSION} (MeshMS_DIR=${MeshMS_DIR})")
