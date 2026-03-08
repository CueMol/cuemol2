cmake_minimum_required(VERSION 3.15...3.26)
project(cuemol LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 14)

##########
# libcuemol2
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/../src/cmake)
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
  cxx_src/wrapper.cpp
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

file(TO_NATIVE_PATH "${LIBCUEMOL2_ROOT}/data/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message(STATUS "DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
target_compile_definitions(cuemol_internal PUBLIC DEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")

# This line will give our library file a .node extension without any "lib" prefix
set_target_properties(cuemol_internal PROPERTIES PREFIX "" SUFFIX ".node")

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
