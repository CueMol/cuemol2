#
#
#

cmake_minimum_required(VERSION 3.12)
if (COMMAND cmake_policy)
  cmake_policy(SET CMP0074 NEW)
  cmake_policy(SET CMP0077 NEW)
endif ()

project(CueMol CXX C)

option(BUILD_GUI "Build CueMol GUI." ON)

find_package(Python)
find_package(Perl REQUIRED)
find_package(BISON REQUIRED)
find_package(FLEX REQUIRED)

find_package(Boost 1.50.0 REQUIRED
  COMPONENTS system thread filesystem chrono timer)

# TO DO: build GUI arch config
if (BUILD_GUI)
  # OpenGL
  find_package(OpenGL)
endif ()

add_subdirectory(src)

message(STATUS
  "\n==============\n"
  "Summary report\n"
  "==============\n")
if (DEFINED CMAKE_BUILD_TYPE)
  message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
endif()

message(STATUS "Compiler: ${CMAKE_CXX_COMPILER} (${CMAKE_CXX_COMPILER_VERSION})")
message(STATUS "Flags: ${CMAKE_CXX_FLAGS}")
message(STATUS "Install prefix: ${CMAKE_INSTALL_PREFIX}")

