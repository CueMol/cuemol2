set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_OUTPUT_EXTENSION_REPLACE 1)  # ref. https://texus.me/2015/09/06/cmake-and-gcov/
SET(CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake ${CMAKE_MODULE_PATH})

set(Boost_USE_STATIC_LIBS OFF)
find_package(Boost 1.50.0 REQUIRED
  COMPONENTS system thread filesystem chrono timer)

find_package(CGAL REQUIRED)
message(STATUS "CGAL_CONFIG: ${CGAL_CONFIG}")
message(STATUS "CGAL_FOUND: ${CGAL_FOUND} INCLUDE_DIR: ${CGAL_INCLUDE_DIRS} LIBRARIES: ${CGAL_LIBRARIES}")

find_package(LibLZMA)
message(STATUS "LIBLZMA_FOUND: ${LIBLZMA_FOUND} INCLUDE_DIR: ${LIBLZMA_INCLUDE_DIRS} LIBRARIES: ${LIBLZMA_LIBRARIES}")
if (${LIBLZMA_FOUND})
  SET(HAVE_LZMA_H "1")
endif()

#####

# OpenGL/GUI
# XXX???: SET(CMAKE_FIND_USE_SYSTEM_ENVIRONMENT_PATH OFF)
find_package(OpenGL)
message(STATUS "OPENGL_FOUND: ${OPENGL_FOUND} OPENGL_GLU_FOUND: ${OPENGL_GLU_FOUND} OpenGL_OpenGL_FOUND: ${OpenGL_OpenGL_FOUND}")
message(STATUS "OPENGL_INCLUDE_DIR: ${OPENGL_INCLUDE_DIR}")
find_package(GLEW)
message(STATUS "GLEW_FOUND: ${GLEW_FOUND} ${GLEW_LIBRARIES}")
if (OPENGL_FOUND AND GLEW_FOUND)
   SET(BUILD_OPENGL_SYSDEP "TRUE")
else ()
   SET(BUILD_OPENGL_SYSDEP "FALSE")
endif ()
message(STATUS "Build OGL sysdep: ${BUILD_OPENGL_SYSDEP}")

if (BUILD_OPENGL_SYSDEP)
  SET(HAVE_GL_GLEW_H 1)
  SET(HAVE_GLEW 1)
  if (WIN32)
    # Windows
    SET(GUI_ARCH MB_GUI_ARCH_WIN)
    SET(STR_GUI_ARCH win)
    SET(HAVE_GL_GL_H 1)
    SET(HAVE_GL_GLU_H 1)
  elseif(APPLE)
    # MacOS X
    SET(GUI_ARCH MB_GUI_ARCH_OSX)
    SET(STR_GUI_ARCH osx)
    SET(HAVE_OPENGL_GL_H 1)
    SET(HAVE_OPENGL_GLU_H 1)
  else()
    # Linux/X11
    SET(GUI_ARCH MB_GUI_ARCH_X11)
    SET(STR_GUI_ARCH x11)
    SET(HAVE_GL_GL_H 1)
    SET(HAVE_GL_GLU_H 1)
  endif()
else()
  # CLI
  SET(GUI_ARCH MB_GUI_ARCH_CLI)
  SET(STR_GUI_ARCH cli)
endif()  

message(STATUS "BUILD_OPENGL_SYSDEP: ${BUILD_OPENGL_SYSDEP}")
message(STATUS "GUI_ARCH: ${GUI_ARCH}")

#####

include(CheckTypeSize)
CHECK_TYPE_SIZE("char" SIZEOF_CHAR LANGUAGE CXX)
CHECK_TYPE_SIZE("short" SIZEOF_SHORT LANGUAGE CXX)
CHECK_TYPE_SIZE("int" SIZEOF_INT LANGUAGE CXX)
CHECK_TYPE_SIZE("long" SIZEOF_LONG LANGUAGE CXX)
CHECK_TYPE_SIZE("long long" SIZEOF_LONG_LONG LANGUAGE CXX)
CHECK_TYPE_SIZE("float" SIZEOF_FLOAT LANGUAGE CXX)
CHECK_TYPE_SIZE("double" SIZEOF_DOUBLE LANGUAGE CXX)
CHECK_TYPE_SIZE("void*" SIZEOF_VOIDP LANGUAGE CXX)

include(TestBigEndian)
TEST_BIG_ENDIAN(IS_HOST_BIG_ENDIAN)
message(STATUS "IS_HOST_BIG_ENDIAN ${IS_HOST_BIG_ENDIAN}")

include(CheckIncludeFileCXX)
CHECK_INCLUDE_FILE_CXX("stdarg.h" HAVE_STDARG_H)
CHECK_INCLUDE_FILE_CXX("unistd.h" HAVE_UNISTD_H)
CHECK_INCLUDE_FILE_CXX("locale.h" HAVE_LOCALE_H)
CHECK_INCLUDE_FILE_CXX("xlocale.h" HAVE_XLOCALE_H)
CHECK_INCLUDE_FILE_CXX("spawn.h" HAVE_SPAWN_H)
CHECK_INCLUDE_FILE_CXX("sys/wait.h" HAVE_SYS_WAIT_H)

include(CheckSymbolExists)
check_symbol_exists("vsnprintf" "stdio.h" HAVE_VSNPRINTF)
check_symbol_exists("vsnprintf_l" "xlocale.h" HAVE_VSNPRINTF_L)

if (${IS_HOST_BIG_ENDIAN})
  SET(BYTEORDER "4321")
else (${IS_HOST_BIG_ENDIAN})
  SET(BYTEORDER "1234")
endif (${IS_HOST_BIG_ENDIAN})

if (${Boost_FOUND})
  SET(HAVE_BOOST "1")
endif (${Boost_FOUND})

if (${Boost_CHRONO_FOUND})
  SET(HAVE_BOOST_CHRONO "1")
endif (${Boost_CHRONO_FOUND})

if (${Boost_FILESYSTEM_FOUND})
  SET(HAVE_BOOST_FILESYSTEM "1")
endif (${Boost_FILESYSTEM_FOUND})

if (${Boost_SYSTEM_FOUND})
  SET(HAVE_BOOST_SYSTEM "1")
endif (${Boost_SYSTEM_FOUND})

if (${Boost_THREAD_FOUND})
  SET(HAVE_BOOST_THREAD "1")
endif (${Boost_THREAD_FOUND})

if (${Boost_TIMER_FOUND})
  SET(HAVE_BOOST_TIMER "1")
endif (${Boost_TIMER_FOUND})

if (WIN32)
  add_definitions(-D_CRT_SECURE_NO_WARNINGS -D_SCL_SECURE_NO_WARNINGS -DUNICODE -D_UNICODE)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${PROJECT_BINARY_DIR}/${CMAKE_BUILD_TYPE})
  add_definitions(-DBOOST_ALL_NO_LIB)
  add_definitions(-DBOOST_ALL_DYN_LINK)
endif()

#####
# Generate config.h

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/config_cmake.h.in
  ${CMAKE_CURRENT_BINARY_DIR}/config.h
  @ONLY)
add_definitions(-DHAVE_CONFIG_H=1)

##########
# Subdirs

include("mcwgen.cmake")

# support libraries
add_subdirectory(pcre)
add_subdirectory(expat)
add_subdirectory(zlib)
add_subdirectory(libpng)

# main components/modules
add_subdirectory(qlib)

if (NOT BUILD_MINIMUM_MODULES)
  add_subdirectory(gfx)
  add_subdirectory(qsys)

  if (BUILD_OPENGL_SYSDEP)
    add_subdirectory(sysdep)
  endif ()
  
  add_subdirectory(modules/molstr)
  add_subdirectory(modules/molvis)
  add_subdirectory(modules/surface)
  add_subdirectory(modules/molanl)
  add_subdirectory(modules/symm)
  add_subdirectory(modules/xtal)
  add_subdirectory(modules/lwview)
  add_subdirectory(modules/rendering)
  add_subdirectory(modules/anim)
  add_subdirectory(modules/mdtools)
  add_subdirectory(modules/importers)
endif ()

# front ends
if (BUILD_PYTHON_BINDINGS)
  find_package(Python3 COMPONENTS Interpreter Development REQUIRED)
  message(STATUS "Python3_Development_FOUND=${Python3_Development_FOUND}")
  message(STATUS "Python3_EXECUTABLE=${Python3_EXECUTABLE}")
  message(STATUS "Python: version=${Python3_VERSION} Python3_INCLUDE_DIRS=${Python3_INCLUDE_DIRS} Python3_LIBRARIES=${Python3_LIBRARIES}")

  if (NOT BUILD_PYTHON_MODULE)
    add_subdirectory(pybr)
  else ()
    add_subdirectory(pymodule)
  endif ()
endif ()

# CLI/main (cuetty)
# if (NOT BUILD_PYTHON_MODULE)
#   add_subdirectory(cli)
# endif ()

# if (BUILD_GUI AND NOT BUILD_MINIMUM_MODULES)
#   add_subdirectory(qt5_gui)
# endif()

#########################################

SET(CUEMOL2_LINK_LIBRARIES
  pcre
  expat
  qmpng
  qmzlib
  qlib
  gfx
  qsys
  molstr
  molvis
  surface
  molanl
  symm
  xtal
  lwview
  render
  anim
  mdtools
  importers
  Boost::filesystem
  CGAL::CGAL
)

if (BUILD_OPENGL_SYSDEP)
  list(APPEND CUEMOL2_LINK_LIBRARIES sysdep)
  
endif ()
# add_library(cuemol2 INTERFACE)
add_library(cuemol2 SHARED)
target_include_directories(
  cuemol2 PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(cuemol2 PRIVATE ${CUEMOL2_LINK_LIBRARIES})
# target_sources(cuemol2
#     INTERFACE FILE_SET HEADERS 
#     BASE_DIRS ${PROJECT_SOURCE_DIR}/src
#     FILES common.h qmtypes.h version.hpp
# )
target_sources(cuemol2
  PRIVATE loader.cpp
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES common.h qmtypes.h version.hpp
)
# message(STATUS "PROJECT_BINARY_DIR=${PROJECT_BINARY_DIR}")
install(TARGETS cuemol2 FILE_SET HEADERS)

install(FILES ${PROJECT_BINARY_DIR}/src/config.h DESTINATION include)
 
# target_sources(cuemol2
#   INTERFACE FILE_SET HEADERS
#   BASE_DIRS ${PROJECT_BINARY_DIR}
#   FILES
# )
# install(TARGETS cuemol2 FILE_SET HEADERS)
