# TO DO: build GUI arch config
if (BUILD_GUI)
  SET(CMAKE_FIND_USE_SYSTEM_ENVIRONMENT_PATH OFF)
  # OpenGL
  find_package(OpenGL)
  message(STATUS "OPENGL_FOUND: ${OPENGL_FOUND} OPENGL_GLU_FOUND: ${OPENGL_GLU_FOUND} OpenGL_OpenGL_FOUND: ${OpenGL_OpenGL_FOUND}")
  message(STATUS "OPENGL_INCLUDE_DIR: ${OPENGL_INCLUDE_DIR}")

  find_package(GLEW)
  message(STATUS "GLEW_FOUND: ${GLEW_FOUND} ${GLEW_LIBRARIES}")

endif ()

##########

include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(SYSDEP_SRCS
  sysdep.cpp
  MouseEventHandler.cpp
  )

SET(SYSDEP_OGL_SRCS
  OglView.cpp
  OglDisplayList.cpp
  OglDisplayContext.cpp
  OglFBOView.cpp
  OglProgramObject.cpp
  OglProgObjMgr.cpp
  )

if (GLEW_FOUND)
  add_definitions(-DHAVE_GL_GLEW_H=1)
  add_definitions(-DHAVE_GLEW=1)
  include_directories(
    ${GLEW_INCLUDE_DIRS}
    )
  list(APPEND SYSDEP_LINK_LIBRARIES GLEW::glew)
endif ()  

if (OPENGL_FOUND)
  if (WIN32)
    # Windows case
    add_definitions(-DHAVE_GL_GL_H=1)
    add_definitions(-DHAVE_GL_GLU_H=1)
  elseif(MACOS)
    # MacOS X
  else()
    # Linux/other
  endif()

  list(APPEND SYSDEP_SRCS ${SYSDEP_OGL_SRCS})
  include_directories(${OPENGL_INCLUDE_DIR} )
  list(APPEND SYSDEP_LINK_LIBRARIES OpenGL::GL OpenGL::GLU)
endif ()

if (WIN32)
  add_definitions(-DSYSDEP_EXPORTS=1)
endif()

message(STATUS "SYSDEP_LINK_LIBRARIES: ${SYSDEP_LINK_LIBRARIES}")
add_library(sysdep SHARED ${SYSDEP_SRCS})
target_link_libraries(sysdep PRIVATE qlib gfx qsys ${SYSDEP_LINK_LIBRARIES})

install(TARGETS sysdep
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )
