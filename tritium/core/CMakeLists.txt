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
  # Mark libcuemol2 symbols as __declspec(dllimport). Required so the dllimport
  # semantics of QLIB_API/QSYS_API propagate to base template static members
  # (e.g. SingletonBase<T>::s_pInst) via the derived dllimport class.
  add_definitions(-DLINK_SHARED)
endif()

SET(NODEJS_LINK_LIBRARIES
  cuemol2
  ${CMAKE_JS_LIB}
  )

# Normal C++ source files
SET(NODEJS_SRCS
  cxx_src/init_cuemol.cpp
  cxx_src/services.cpp
  cxx_src/wrapper.cpp
  ${CMAKE_JS_SRC}
  )

  list(APPEND NODEJS_SRCS
    cxx_src/gui_services.cpp
    cxx_src/ElecView.cpp
    cxx_src/ElecDisplayContext.cpp
    cxx_src/EcShaderObject.cpp
    cxx_src/EcBufferRep.cpp
    cxx_src/EcTexRep.cpp
    cxx_src/EcDataTexture.cpp
    cxx_src/EcFloatDataTexture.cpp
    cxx_src/EcRenderTarget.cpp
    cxx_src/EcTimerImpl.cpp
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

# .node extension, and a relocatable rpath so the loader finds the bundled
# shared libs at both dev time (build/lib/) and in the packaged app
# (app/node_modules/@cuemol/core/build/lib/). macOS uses @loader_path (dyld),
# Linux uses $ORIGIN (ld.so); Windows has no rpath (DLLs sit next to the .node).
# BUILD_WITH_INSTALL_RPATH TRUE makes cmake-js in-place builds use INSTALL_RPATH
# directly, avoiding the absolute LIBCUEMOL2_LIBDIR being baked in.
if(APPLE)
  set(CUEMOL_NODE_RPATH "@loader_path/../lib")
elseif(UNIX)
  set(CUEMOL_NODE_RPATH "$ORIGIN/../lib")
else()
  set(CUEMOL_NODE_RPATH "")
endif()
set_target_properties(cuemol_internal PROPERTIES
  PREFIX "" SUFFIX ".node"
  INSTALL_RPATH "${CUEMOL_NODE_RPATH}"
  BUILD_WITH_INSTALL_RPATH TRUE
)

# Copy runtime libraries so the cuemol_internal .node addon can find them at
# load time. Using add_custom_target(ALL) ensures this runs on every build even
# when cuemol_internal sources are unchanged (unlike POST_BUILD which only
# fires when the target is rebuilt).
# - macOS/Linux: leverage the @loader_path/../lib rpath baked into the .node;
#   copy shared libs to build/lib/.
# - Windows: no rpath; place DLLs next to the .node file so the Windows DLL
#   search resolves them.
if(WIN32)
  set(LIBCUEMOL2_BINDIR "${LIBCUEMOL2_ROOT}/bin")
  file(GLOB LIBCUEMOL2_DLLS "${LIBCUEMOL2_BINDIR}/*.dll")
  # cuemol2.dll has a transitive dependency on Boost.Filesystem etc.;
  # the release Boost DLLs ship in ${Boost_ROOT}/lib and need to sit next to
  # the .node so the Windows loader can resolve them. The glob excludes the
  # `-gd-` debug variants by anchoring on the `-mt-x64-` release suffix.
  file(GLOB BOOST_DLLS "${Boost_ROOT}/lib/boost_*-mt-x64-*.dll")
  add_custom_target(copy_dylibs ALL
    COMMAND ${CMAKE_COMMAND} -E copy_if_different ${LIBCUEMOL2_DLLS} "$<TARGET_FILE_DIR:cuemol_internal>"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different ${BOOST_DLLS} "$<TARGET_FILE_DIR:cuemol_internal>"
    COMMENT "Copying libcuemol2 + Boost DLLs to .node directory"
  )
  add_dependencies(copy_dylibs cuemol_internal)
elseif(APPLE)
  add_custom_target(copy_dylibs ALL
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/lib"
    COMMAND bash -c "cp '${LIBCUEMOL2_LIBDIR}'/*.dylib '${CMAKE_BINARY_DIR}/lib/'"
    COMMENT "Copying dylibs from ${LIBCUEMOL2_LIBDIR} to build/lib/"
  )
  file(GLOB LIBPYTHON_DYLIBS "${LIBCUEMOL2_LIBDIR}/python/lib/libpython*.dylib")
  if(LIBPYTHON_DYLIBS)
    add_custom_command(TARGET copy_dylibs POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_if_different ${LIBPYTHON_DYLIBS} "${CMAKE_BINARY_DIR}/lib"
      COMMENT "Copying libpython dylibs to build/lib/"
    )
  endif()
else()
  add_custom_target(copy_dylibs ALL
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/lib"
    COMMAND bash -c "cp -P '${LIBCUEMOL2_LIBDIR}'/*.so* '${CMAKE_BINARY_DIR}/lib/'"
    COMMENT "Copying shared libs from ${LIBCUEMOL2_LIBDIR} to build/lib/"
  )
  file(GLOB LIBPYTHON_SOS "${LIBCUEMOL2_LIBDIR}/python/lib/libpython*.so*")
  if(LIBPYTHON_SOS)
    add_custom_command(TARGET copy_dylibs POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_if_different ${LIBPYTHON_SOS} "${CMAKE_BINARY_DIR}/lib"
      COMMENT "Copying libpython shared libs to build/lib/"
    )
  endif()
endif()

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
