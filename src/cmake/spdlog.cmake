# spdlog, fetched at configure time and built with its own CMake as the static
# target spdlog::spdlog. The fmt library bundled with it
# (include/spdlog/fmt/bundled) is what LString::fmtFormat uses; logging itself
# still goes through MsgLog / LOG_DPRINTLN.
#
# The release is pinned by URL and SHA256, so every build gets the same
# sources. To build without network access, point CMake at an unpacked copy
# of the same release: -DFETCHCONTENT_SOURCE_DIR_SPDLOG=<dir>.
#
# To update: change the version in the URL and the hash.

include(FetchContent)

# Extracted files get the time of extraction, so a re-download rebuilds what
# depends on them (CMake 3.24+; older versions have no such policy).
if (POLICY CMP0135)
  cmake_policy(SET CMP0135 NEW)
endif ()

FetchContent_Declare(spdlog
  URL      https://github.com/gabime/spdlog/archive/refs/tags/v1.17.0.tar.gz
  URL_HASH SHA256=d8862955c6d74e5846b3f580b1605d2428b11d97a410d86e2fb13e857cd3a744
)

# Static and compiled (not header-only), position-independent because it is
# linked into the shared libcuemol2, and without its install / examples /
# tests. SPDLOG_MSVC_UTF8 would add /utf-8 as a PUBLIC flag to every target
# that links it; FMT_UNICODE=0 below removes the need instead.
set(SPDLOG_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(SPDLOG_BUILD_PIC ON CACHE BOOL "" FORCE)
set(SPDLOG_INSTALL OFF CACHE BOOL "" FORCE)
set(SPDLOG_BUILD_EXAMPLE OFF CACHE BOOL "" FORCE)
set(SPDLOG_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(SPDLOG_BUILD_BENCH OFF CACHE BOOL "" FORCE)
set(SPDLOG_MSVC_UTF8 OFF CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(spdlog)

# LString.hpp defines the same value for builds that include the installed
# headers without this target (the tritium native addon).
target_compile_definitions(spdlog PUBLIC FMT_UNICODE=0)

# Third-party code: its warnings are not ours to fix.
target_compile_options(spdlog PRIVATE $<IF:$<CXX_COMPILER_ID:MSVC>,/w,-w>)

# Only the headers are installed: the archive is linked into libcuemol2, and
# code built against the installed headers reaches the bundled fmt through
# LString.hpp.
install(DIRECTORY ${spdlog_SOURCE_DIR}/include/ DESTINATION include)
