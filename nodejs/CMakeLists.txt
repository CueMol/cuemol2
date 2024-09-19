cmake_minimum_required(VERSION 3.15...3.26)
project(cuemol LANGUAGES C CXX)

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

include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${NODE_ADDON_API_DIR}
  ${CMAKE_JS_INC}
  )

#####################

if (WIN32)
  add_definitions(-DNODEJS_EXPORTS=1)
endif()

SET(NODEJS_LINK_LIBRARIES
  cuemol2
  ${CMAKE_JS_LIB}
  )

# Normal C++ source files
SET(NODEJS_SRCS
  src/nodejs.cpp
  src/init_cuemol.cpp
  src/wrapper.cpp
  ${CMAKE_JS_SRC}
  )

add_library(cuemol_internal SHARED ${NODEJS_SRCS})
target_link_libraries(cuemol_internal PRIVATE ${NODEJS_LINK_LIBRARIES})

# This line will give our library file a .node extension without any "lib" prefix
set_target_properties(cuemol_internal PROPERTIES PREFIX "" SUFFIX ".node")

install(TARGETS cuemol_internal
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )

SET(JS_OUTPUT_DIR ${CMAKE_BINARY_DIR}/javascript)

# add_custom_command(
#   TARGET cuemol_internal POST_BUILD
#   COMMAND python3 ${CMAKE_SOURCE_DIR}/src/python/make_wrapper_table.py --input_dir ${CMAKE_BINARY_DIR}/javascript/wrappers --output_js ${JS_OUTPUT_DIR}/wrapper_loader.js
#   )

# add_custom_target(cuemol_internal_copy)

# add_custom_command(
#   TARGET cuemol_internal_copy PRE_BUILD
#   COMMAND ${CMAKE_COMMAND} -E copy
#   ${CMAKE_CURRENT_SOURCE_DIR}/es6/*.js
#   ${JS_OUTPUT_DIR}
#   )

# XXX: copy to deploy dir
# add_custom_command(
#   TARGET cuemol_internal_copy PRE_BUILD
#   COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/data/shaders
#   COMMAND ${CMAKE_COMMAND} -E copy
#   ${CMAKE_CURRENT_SOURCE_DIR}/shaders/*
#   ${CMAKE_BINARY_DIR}/data/shaders
#   )

# add_dependencies(cuemol_internal cuemol_internal_copy)

# add_custom_command(
#   TARGET cuemol_internal POST_BUILD
#   COMMAND ${CMAKE_COMMAND} -E copy
#   ${CMAKE_CURRENT_SOURCE_DIR}/es6/base_wrapper.js
#   ${JS_OUTPUT_DIR}/base_wrapper.js
#   )
