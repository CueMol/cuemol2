include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(MOLVIS_SRCS
molvis.cpp
AnIsoURenderer.cpp
BallStickRenderer.cpp
CPKRenderer.cpp
CPK2Renderer.cpp
CubicSpline.cpp
SplineCoeffSet.cpp
SplineRenderer.cpp
TubeRenderer.cpp
TubeSection.cpp
RibbonRenderer.cpp
Ribbon2Renderer.cpp
JctTable.cpp
PaintColoring.cpp
NARenderer.cpp
AtomIntrRenderer.cpp
DisoRenderer.cpp
RainbowColoring.cpp
# ScriptColoring.cpp
DistPickDrawObj.cpp
smospl/SmoothSpline.cpp
smospl/linalg.cpp
smospl/spline_internal.cpp
smospl/alglibinternal.cpp
smospl/smoothspline_impl.cpp
smospl/spline_util.cpp
smospl/ap.cpp
smospl/spline_impl2.cpp
)

##########
# CueMol interface definitions for MCWRAPGEN

SET(MOLVIS_MCWG_QIFS
AnIsoURenderer.qif
CPKRenderer.qif
CPK2Renderer.qif
BallStickRenderer.qif
SplineRenderer.qif
TubeRenderer.qif
TubeSection.qif
RibbonRenderer.qif
Ribbon2Renderer.qif
JctTable.qif
PaintColoring.qif
NARenderer.qif
AtomIntrRenderer.qif
DisoRenderer.qif
RainbowColoring.qif
# ScriptColoring.qif
DistPickDrawObj.qif
)

# module loader generated by MCWG
SET(MOLVIS_MODLDR_SRC molvis.moddef)

##########
# GL/GLSL files (for OpenGL build)
IF (BUILD_OPENGL_SYSDEP)
  # GLSL shader files
  SET(GLSL_SHADER_FILES
    sphere_vertex.glsl
    sphere_frag.glsl
    cylinder_vertex.glsl
    cylinder_frag.glsl
  )
  include_directories(
    ${GLEW_INCLUDE_DIRS}
    ${OPENGL_INCLUDE_DIR}
  )
ENDIF ()

MCWRAPGEN_CLASS(MOLVIS_SRCS ${MOLVIS_MCWG_QIFS})
MCWRAPGEN_MODULE(MOLVIS_SRCS ${MOLVIS_MODLDR_SRC} ${MOLVIS_MCWG_QIFS})

# add_library(molvis SHARED ${MOLVIS_SRCS} ${MCWG_HEADERS})
add_library(molvis STATIC ${MOLVIS_SRCS} ${MCWG_HEADERS})

if (WIN32)
  add_definitions(-DMOLVIS_EXPORTS=1)
else()
  target_compile_options(molvis PUBLIC "-fPIC")
endif()

target_link_libraries(molvis PRIVATE qlib gfx qsys molstr Boost::filesystem Boost::thread)

MCWRAPGEN_SCR_WRAPPERS(molvis)

install(TARGETS molvis
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )

install(FILES ${GLSL_SHADER_FILES} DESTINATION data/shaders)
