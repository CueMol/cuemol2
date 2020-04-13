#
#
#

cmake_minimum_required(VERSION 3.12)
if (COMMAND cmake_policy)
  cmake_policy(SET CMP0074 NEW)
  cmake_policy(SET CMP0077 NEW)
endif ()

project(CueMol CXX C)

message(STATUS "CMAKE_PREFIX_PATH: ${CMAKE_PREFIX_PATH}")
option(BUILD_GUI "Build CueMol GUI." ON)
option(BUILD_PYTHON_BINDINGS "Build Python bindings")

find_package(Perl REQUIRED)
find_package(BISON REQUIRED)
find_package(FLEX REQUIRED)

add_subdirectory(src)

message(STATUS
  "\n==============\n"
  "Summary report\n"
  "==============\n")
message(STATUS "BUILD_GUI: ${BUILD_GUI}")

if (DEFINED CMAKE_BUILD_TYPE)
  message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
endif()

message(STATUS "Compiler: ${CMAKE_CXX_COMPILER} (${CMAKE_CXX_COMPILER_VERSION})")
message(STATUS "Flags: ${CMAKE_CXX_FLAGS}")
message(STATUS "Install prefix: ${CMAKE_INSTALL_PREFIX}")

