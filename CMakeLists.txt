cmake_minimum_required(VERSION 3.5)
project(CueMol CXX C)
find_package(Python)
find_package(Perl REQUIRED)

find_package(Boost 1.50.0 REQUIRED
  COMPONENTS system thread filesystem chrono timer)


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
