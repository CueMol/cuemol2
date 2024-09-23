
# TODO: update cmake version
cmake_minimum_required(VERSION 3.12)
if (COMMAND cmake_policy)
  # find_package() uses <PackageName>_ROOT variables.
  cmake_policy(SET CMP0074 NEW)
  # option() honors normal variables.
  cmake_policy(SET CMP0077 NEW)
endif ()

project(CueMol CXX C)

message(STATUS "CMAKE_PREFIX_PATH: ${CMAKE_PREFIX_PATH}")
option(BUILD_PYTHON_BINDINGS "Build Python bindings")
option(BUILD_MINIMUM_MODULES "Build CueMol with minimum modules." OFF)
option(BUILD_XPCJS_BINDINGS "Build XPCOM-js bindings")
option(BUILD_NODEJS_BINDINGS "Build node.js bindings")

find_package(Perl 5.10.0 REQUIRED)
message(STATUS "PERL_EXECUTABLE: ${PERL_EXECUTABLE}")
find_package (Python3 3.6 COMPONENTS Interpreter)
message(STATUS "Python3_EXECUTABLE: ${Python3_EXECUTABLE}")
find_package(BISON 3.7.4 REQUIRED)
find_package(FLEX 2.6.4 REQUIRED)

find_package(Git REQUIRED)
message(STATUS "GIT_EXECUTABLE: ${GIT_EXECUTABLE}")

if (APPLE)
  # set(CMAKE_OSX_DEPLOYMENT_TARGET "10.9" CACHE STRING "" FORCE)
  # set(CMAKE_CXX_FLAGS "-stdlib=libc++")
endif ()

add_subdirectory(src)

message(STATUS
  "\n==============\n"
  "Summary report\n"
  "==============\n")
message(STATUS "BUILD_MINIMUM_MODULES: ${BUILD_MINIMUM_MODULES}")

if (DEFINED CMAKE_BUILD_TYPE)
  message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
endif()

message(STATUS "Compiler: ${CMAKE_CXX_COMPILER} (${CMAKE_CXX_COMPILER_VERSION})")
message(STATUS "Flags: ${CMAKE_CXX_FLAGS}")
message(STATUS "Install prefix: ${CMAKE_INSTALL_PREFIX}")
