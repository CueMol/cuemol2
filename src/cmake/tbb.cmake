# Fetch and build Intel oneTBB from source, linked statically into libcuemol2.
#
# Gated by the ENABLE_TBB option (default OFF). oneTBB is a modern CMake project
# that exports the TBB::tbb imported target. We build it as a static archive so
# that no extra runtime shared library has to be shipped or rpath-resolved;
# libcuemol2 is the only consumer, so a single in-process copy is safe and the
# oneTBB scheduler-singleton caveat for static linking does not apply.

include(FetchContent)

set(CUEMOL_ONETBB_TAG "v2022.0.0" CACHE STRING "oneTBB git tag to fetch")

# Configure the oneTBB sub-build before population. oneTBB lowers the CMake
# policy version (cmake_minimum_required) inside its own CMakeLists, which makes
# CMP0077 OLD there, so plain variables get cleared by its option() calls. Set
# these as cache entries (FORCE) so option() honors them regardless of policy
# (same approach as gtest's gtest_force_shared_crt).
set(TBB_TEST OFF CACHE BOOL "" FORCE)         # do not build oneTBB's own tests
set(TBB_EXAMPLES OFF CACHE BOOL "" FORCE)
set(TBBMALLOC_BUILD OFF CACHE BOOL "" FORCE)  # only the tbb core is needed
set(TBB_STRICT OFF CACHE BOOL "" FORCE)       # do not treat warnings as errors
set(TBB_INSTALL OFF CACHE BOOL "" FORCE)      # keep it out of the cuemol2 install tree

# Build a static archive whose objects are position-independent, so they can be
# linked into the cuemol2 shared library. Save and restore the parent-scope
# values so the rest of the build is unaffected.
set(_cuemol_saved_build_shared_libs "${BUILD_SHARED_LIBS}")
set(_cuemol_saved_pic "${CMAKE_POSITION_INDEPENDENT_CODE}")
set(BUILD_SHARED_LIBS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Match the dynamic CRT (/MD) used by the rest of the build on MSVC.
if (MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif ()

FetchContent_Declare(
  onetbb
  GIT_REPOSITORY https://github.com/uxlfoundation/oneTBB.git
  GIT_TAG        ${CUEMOL_ONETBB_TAG}
)
FetchContent_MakeAvailable(onetbb)

set(BUILD_SHARED_LIBS "${_cuemol_saved_build_shared_libs}")
set(CMAKE_POSITION_INDEPENDENT_CODE "${_cuemol_saved_pic}")

message(STATUS "oneTBB enabled (static): tag ${CUEMOL_ONETBB_TAG}")
