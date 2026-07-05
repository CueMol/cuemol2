# Locate libumbreon (the Embree ray-tracing backend) installed into the deplibs
# prefix by build_scripts (task install_umbreon / build_umbreon_posix) and expose
# it as the umbreon::umbreon imported target.
#
# Gated by the ENABLE_UMBREON option. The libcuemol2 build passes the config
# package location via -Dumbreon_DIR=<basedir>/umbreon/lib/cmake/umbreon. The
# generated umbreonConfig.cmake runs find_dependency(embree 4) and
# find_dependency(TBB), so umbreon resolves to the SAME bundled Embree/TBB that
# the rest of libcuemol2 uses -- keeping exactly one oneTBB runtime in the
# process. Those dependencies are located via the -Dembree_DIR / -DTBB_DIR cache
# entries the build already passes.

# umbreon is built with UMBREON_WITH_OIDN=ON (see build_umbreon_posix), which
# links the static Intel OIDN denoiser PUBLIC into libumbreon. umbreonConfig does
# NOT find_dependency(OpenImageDenoise) (OIDN is an optional umbreon feature, so
# its Config stays denoiser-agnostic), so the consumer must define the imported
# OpenImageDenoise target itself for the final link to resolve umbreon's OIDN
# symbols. Located via the -DOpenImageDenoise_DIR cache entry the build passes;
# its own Config runs find_dependency(TBB), resolving to the same bundled oneTBB.
find_package(OpenImageDenoise 2 CONFIG REQUIRED)
message(STATUS "OpenImageDenoise found (static): ${OpenImageDenoise_VERSION}")

find_package(umbreon CONFIG REQUIRED)

message(STATUS "umbreon found (static): ${umbreon_VERSION} (umbreon_DIR=${umbreon_DIR})")
