cmake_minimum_required(VERSION 3.12)
project(cuetty CXX C)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_OUTPUT_EXTENSION_REPLACE 1)  # ref. https://texus.me/2015/09/06/cmake-and-gcov/
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)

##########

find_package(LIBCUEMOL2)
message(STATUS "LIBCUEMOL2: ${LIBCUEMOL2_FOUND}")
message(STATUS "LIBCUEMOL2_LIBDIR: ${LIBCUEMOL2_LIBDIR}")
message(STATUS "LIBCUEMOL2_INCLUDE_DIR: ${LIBCUEMOL2_INCLUDE_DIR}")
add_definitions(-DHAVE_CONFIG_H=1)

##########

set(Boost_USE_STATIC_LIBS OFF)
find_package(Boost 1.50.0 REQUIRED
  COMPONENTS system thread filesystem chrono timer)

find_package(CGAL REQUIRED)
message(STATUS "CGAL_CONFIG: ${CGAL_CONFIG}")
message(STATUS "CGAL_FOUND: ${CGAL_FOUND} INCLUDE_DIR: ${CGAL_INCLUDE_DIRS} LIBRARIES: ${CGAL_LIBRARIES}")

#####################

# Dependent libs
SET(CLI_LINK_LIBRARIES
  cuemol2
  Boost::filesystem
)

# Normal C++ source files
SET(CLI_SRCS
TTYView.cpp
cli_main.cpp
)

set(DATA_DIR ${CMAKE_SOURCE_DIR}/../data/)

set(DATA_FILES
${DATA_DIR}/prot_top.xml
${DATA_DIR}/prot_props.xml
${DATA_DIR}/nucl_top.xml
${DATA_DIR}/nucl_props.xml
${DATA_DIR}/sugar_top.xml
${DATA_DIR}/mono_top.xml
${DATA_DIR}/default_params.xml
${DATA_DIR}/symop.dat
${DATA_DIR}/default_style.xml
)

set(SYSCONFIG_FILE ${DATA_DIR}/sysconfig.xml)

#####################
# cuetty exe target

add_executable(cuetty ${CLI_SRCS})

target_include_directories(
  cuetty PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${LIBCUEMOL2_INCLUDE_DIR}
)

target_link_directories(
  cuetty PRIVATE
  ${LIBCUEMOL2_LIBDIR}
)
file(TO_NATIVE_PATH "${CMAKE_INSTALL_PREFIX}/data/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message("DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
target_compile_definitions(cuetty PUBLIC DEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")

if (BUILD_PYTHON_BINDINGS)
  list(APPEND CLI_LINK_LIBRARIES pybr)
  target_compile_definitions(cuetty PUBLIC HAVE_PYTHON=1)
endif ()

target_link_libraries(cuetty PRIVATE
  ${CLI_LINK_LIBRARIES}
)

install(TARGETS cuetty
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
install(FILES ${DATA_FILES} DESTINATION data/data)
install(FILES ${SYSCONFIG_FILE} DESTINATION data)

# For VS Debug
set_target_properties(cuetty PROPERTIES
  VS_DEBUGGER_ENVIRONMENT "PATH=${BOOST_LIBRARYDIR};${CMAKE_PREFIX_PATH}/bin;%PATH%")

set_target_properties(cuetty PROPERTIES
  INSTALL_RPATH "@executable_path/../lib")
