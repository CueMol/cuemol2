include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(RENDER_SRCS
render.cpp
FileDisplayContext.cpp
ImgSceneExporter.cpp
MqoDisplayContext.cpp
MqoSceneExporter.cpp
PngSceneExporter.cpp
PovDisplayContext.cpp
PovSceneExporter.cpp
PovSilBuilder.cpp
RendIntData.cpp
WbpSceneExporter.cpp
StlDisplayContext.cpp
StlSceneExporter.cpp
LuxRendDisplayContext.cpp
LuxRendSceneExporter.cpp
LuxCoreSceneExporter.cpp
LuxCoreDisplayContext.cpp
)

##########
# CueMol interface definitions for MCWRAPGEN

SET(RENDER_MCWG_QIFS
ImgSceneExporter.qif
MqoSceneExporter.qif
PngSceneExporter.qif
PovSceneExporter.qif
WbpSceneExporter.qif
StlSceneExporter.qif
LuxRendSceneExporter.qif
LuxCoreSceneExporter.qif
  )

# module loader generated by MCWG
SET(RENDER_MODLDR_SRC render.moddef)

MCWRAPGEN_CLASS(RENDER_SRCS ${RENDER_MCWG_QIFS})
MCWRAPGEN_MODULE(RENDER_SRCS ${RENDER_MODLDR_SRC} ${RENDER_MCWG_QIFS})

# add_library(render SHARED ${RENDER_SRCS} ${MCWG_HEADERS})
add_library(render STATIC ${RENDER_SRCS} ${MCWG_HEADERS})

if (WIN32)
  add_definitions(-DRENDER_EXPORTS=1)
else()
  target_compile_options(render PUBLIC "-fPIC")
endif()

target_link_libraries(render PRIVATE qlib gfx qsys CGAL::CGAL qmpng qmzlib Boost::filesystem)

MCWRAPGEN_SCR_WRAPPERS(render)

install(TARGETS render
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )
