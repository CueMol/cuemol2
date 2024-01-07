# Normal C++ source files
SET(SYSDEP_SRCS
  sysdep.cpp
  MouseEventHandler.cpp
  OglView.cpp
  OglDisplayList.cpp
  OglDisplayContext.cpp
  OglFBOView.cpp
  OglProgramObject.cpp
  OglProgObjMgr.cpp
  Canvas2DTextRender2.cpp
)

SET(SYSDEP_HDRS
MouseEventHandler.hpp
OglDisplayContext.hpp
OglDisplayList.hpp
OglError.hpp
OglFBOView.hpp
OglHitData.hpp
OglProgObjMgr.hpp
OglProgramObject.hpp
OglView.hpp
OglViewCap.hpp
TouchEventHandler.hpp
sysdep.hpp
)

if (WIN32)
  # Windows case
  list(APPEND SYSDEP_SRCS
    WglView.cpp
    WglDisplayContext.cpp
  )
  list(APPEND SYSDEP_HDRS
    WglView.hpp
    WglDisplayContext.hpp
  )
elseif(APPLE)
  # MacOS X
  list(APPEND SYSDEP_SRCS
    CglView.cpp
    CglDisplayContext.cpp
  )
  list(APPEND SYSDEP_HDRS
    CglView.hpp
    CglDisplayContext.hpp
  )
else()
  # Linux/X11
  list(APPEND SYSDEP_SRCS
    XglView.cpp
    XglDisplayContext.cpp
  )
  list(APPEND SYSDEP_HDRS
    XglView.hpp
    XglDisplayContext.hpp
  )
endif()

SET(SYSDEP_LINK_LIBRARIES
  qlib gfx qsys
  OpenGL::GL OpenGL::GLU GLEW::glew_s)

###################
# GLSL shader files
SET(GLSL_SHADER_FILES
  default_vert.glsl
  default_frag.glsl
  edge_vert.glsl
  edge_frag.glsl
  silh_vert.glsl
  silh_frag.glsl
  es2_default_vert.glsl
  es2_default_frag.glsl
)

#####################
# sysdep library target

# add_library(sysdep SHARED)
add_library(sysdep STATIC)

target_sources(sysdep
  PRIVATE ${SYSDEP_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${SYSDEP_HDRS}
)

target_include_directories(
  sysdep PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${GLEW_INCLUDE_DIRS}
  ${OPENGL_INCLUDE_DIR}
)

if (WIN32)
  target_compile_definitions(sysdep PUBLIC SYSDEP_EXPORTS=1)
else()
  target_compile_options(sysdep PUBLIC "-fPIC")
endif()

# message(STATUS "SYSDEP_LINK_LIBRARIES: ${SYSDEP_LINK_LIBRARIES}")
target_link_libraries(sysdep PRIVATE ${SYSDEP_LINK_LIBRARIES})

install(TARGETS sysdep
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  FILE_SET HEADERS
)
install(FILES ${GLSL_SHADER_FILES} DESTINATION data/shaders)
