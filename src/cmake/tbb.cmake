# Locate the prebuilt static Intel oneTBB shipped in the deplibs bundle and expose
# it as the TBB::tbb imported target, linked statically into libcuemol2.
#
# Gated by the ENABLE_TBB option. oneTBB is provided by the deplibs bundle (see
# build_scripts/deplibs.env: TBB_VER); the libcuemol2 build passes the config
# package location via -DTBB_DIR=<basedir>/tbb-<ver>/lib/cmake/TBB. We link the
# static archive so that no extra runtime shared library has to be shipped or
# rpath-resolved; libcuemol2 is the only in-process consumer, so a single static
# copy is safe and the oneTBB scheduler-singleton caveat does not apply.
#
# Embree (also from the bundle, built with EMBREE_TASKING_SYSTEM=TBB) and umbreon
# both resolve to this same TBB::tbb, so the process holds exactly one oneTBB
# runtime. Do not also fetch or build a separate oneTBB.

find_package(TBB CONFIG REQUIRED)

message(STATUS "oneTBB found (static): ${TBB_VERSION} (TBB_DIR=${TBB_DIR})")
