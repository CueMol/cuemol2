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

if (BUILD_GUI AND OPENGL_FOUND)
  list(APPEND SYSDEP_SRCS ${SYSDEP_OGL_SRCS})
  include_directories(
    ${OPENGL_INCLUDE_DIR}
    )
endif ()

if (WIN32)
  add_definitions(-DSYSDEP_EXPORTS=1)
endif()

add_library(sysdep SHARED ${SYSDEP_SRCS})
target_link_libraries(sysdep PRIVATE qlib gfx qsys)

# add_custom_target(sysdep_generate_headers DEPENDS ${MCWG_HEADERS})
# add_dependencies(sysdep sysdep_generate_headers)

install(TARGETS sysdep
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )
