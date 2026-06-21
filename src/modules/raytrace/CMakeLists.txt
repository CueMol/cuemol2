# raytrace: umbreon (Embree) ray-tracing backend module.
#
# For now this only provides a build-system smoke entry point that drives
# umbreon::render() (proving the deplibs-bundled Embree/TBB + umbreon static link
# works inside the cuemol2 build). The real cuemol scene -> umbreon::Scene
# conversion, exposed as a qsys offscreen renderer, will grow here in a later
# phase. Only built when ENABLE_UMBREON is on (see src/CMakeLists.txt).

add_library(raytrace STATIC
  umbreon_smoke.cpp
)

# umbreon::umbreon (imported from the deplibs prefix) carries its include dir and
# PUBLIC links to the bundled Embree/TBB, so consumers resolve them transitively.
target_link_libraries(raytrace PRIVATE umbreon::umbreon)
