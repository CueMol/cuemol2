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

# main components
add_subdirectory(qlib)
if (BUILD_PYTHON_BINDINGS)
  add_subdirectory(pybr)
  add_subdirectory(pymodule)
endif ()
add_subdirectory(gfx)
add_subdirectory(qsys)
if (BUILD_GUI)
  add_subdirectory(sysdep)
endif()

# modules
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

# CLI/main (cuetty)
add_subdirectory(cli)

if (BUILD_GUI)
  add_subdirectory(qt5_gui)
endif()
