cmake_minimum_required(VERSION 3.15...3.26)
project(cuemol LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)

# Read LIBCUEMOL2_ROOT from environment variable if not set via -D flag
if(NOT DEFINED LIBCUEMOL2_ROOT AND DEFINED ENV{LIBCUEMOL2_ROOT})
  set(LIBCUEMOL2_ROOT "$ENV{LIBCUEMOL2_ROOT}")
  message(STATUS "LIBCUEMOL2_ROOT from environment: ${LIBCUEMOL2_ROOT}")
endif()

if(NOT DEFINED LIBCUEMOL2_ROOT OR LIBCUEMOL2_ROOT STREQUAL "")
  message(FATAL_ERROR "LIBCUEMOL2_ROOT is not set. Pass it via -DLIBCUEMOL2_ROOT=<path> or set the LIBCUEMOL2_ROOT environment variable.")
endif()

if(NOT DEFINED Boost_ROOT AND DEFINED ENV{Boost_ROOT})
  set(Boost_ROOT "$ENV{Boost_ROOT}")
  message(STATUS "Boost_ROOT from environment: ${Boost_ROOT}")
endif()

##########
# libcuemol2
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)
find_package(LIBCUEMOL2 REQUIRED)
message(STATUS "LIBCUEMOL2: ${LIBCUEMOL2_FOUND}")
message(STATUS "LIBCUEMOL2_LIBDIR: ${LIBCUEMOL2_LIBDIR}")
message(STATUS "LIBCUEMOL2_INCLUDE_DIR: ${LIBCUEMOL2_INCLUDE_DIR}")
add_definitions(-DHAVE_CONFIG_H=1)

##########
# Boost
set(Boost_USE_STATIC_LIBS OFF)
find_package(Boost 1.50.0 REQUIRED
  COMPONENTS system thread filesystem chrono timer)

##########
# Include node-addon-api wrappers
execute_process(COMMAND node -p "require('node-addon-api').include"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/src
        OUTPUT_VARIABLE NODE_ADDON_API_DIR
        )
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
message(STATUS "NODE_ADDON_API_DIR: ${NODE_ADDON_API_DIR}")

# Essential include files to build a node addon,
# you should add this line in every CMake.js based project.

##########

if (WIN32)
  add_definitions(-DNODEJS_EXPORTS=1)
endif()

SET(NODEJS_LINK_LIBRARIES
  cuemol2
  ${CMAKE_JS_LIB}
  )

# Normal C++ source files
SET(NODEJS_SRCS
  cxx_src/init_cuemol.cpp
  cxx_src/services.cpp
  cxx_src/gui_services.cpp
  cxx_src/wrapper.cpp
  cxx_src/ElecView.cpp
  cxx_src/ElecDisplayContext.cpp
  cxx_src/EcShaderObject.cpp
  cxx_src/EcBufferRep.cpp
  cxx_src/EcTexRep.cpp
  cxx_src/EcTimerImpl.cpp
  ${CMAKE_JS_SRC}
  )

add_library(cuemol_internal SHARED ${NODEJS_SRCS})
target_include_directories(
  cuemol_internal PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${LIBCUEMOL2_INCLUDE_DIR}
  ${NODE_ADDON_API_DIR}
  ${CMAKE_JS_INC}
)

target_link_directories(
  cuemol_internal PRIVATE
  ${LIBCUEMOL2_LIBDIR}
)

target_link_libraries(
  cuemol_internal PRIVATE
  ${NODEJS_LINK_LIBRARIES}
)

file(TO_NATIVE_PATH "${LIBCUEMOL2_ROOT}/share/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message(STATUS "DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
target_compile_definitions(cuemol_internal PUBLIC DEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")

# .node extension, and @loader_path-relative rpath so dyld finds the bundled
# dylibs at both dev time (build/lib/) and in the packaged .app
# (app/node_modules/@cuemol/core/build/lib/).
# BUILD_WITH_INSTALL_RPATH TRUE makes cmake-js in-place builds use INSTALL_RPATH
# directly, avoiding the absolute LIBCUEMOL2_LIBDIR being baked in.
set_target_properties(cuemol_internal PROPERTIES
  PREFIX "" SUFFIX ".node"
  INSTALL_RPATH "@loader_path/../lib"
  BUILD_WITH_INSTALL_RPATH TRUE
)

# Always copy dylibs to build/lib/ so the @loader_path/../lib rpath resolves
# correctly during development. Using add_custom_target(ALL) ensures this runs
# on every build even when cuemol_internal sources are unchanged (unlike
# POST_BUILD which only fires when the target is rebuilt).
add_custom_target(copy_dylibs ALL
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/lib"
  COMMAND bash -c "cp '${LIBCUEMOL2_LIBDIR}'/*.dylib '${CMAKE_BINARY_DIR}/lib/'"
  COMMENT "Copying dylibs from ${LIBCUEMOL2_LIBDIR} to build/lib/"
)

install(TARGETS cuemol_internal
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )

# Copy TypeScript wrappers from the installed prefix to the source tree.
# This runs after the native addon is built so that the wrapper files are
# available for TypeScript compilation.
set(TS_WRAPPER_SRC_DIR "${LIBCUEMOL2_ROOT}/share/typescript")
set(TS_WRAPPER_DST_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/wrappers")

add_custom_target(copy_wrappers ALL
# add_custom_command(
#   TARGET cuemol_internal POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "${TS_WRAPPER_DST_DIR}"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${TS_WRAPPER_SRC_DIR}" "${TS_WRAPPER_DST_DIR}"
  COMMENT "Copying TypeScript wrappers from ${TS_WRAPPER_SRC_DIR} to ${TS_WRAPPER_DST_DIR}"
)
