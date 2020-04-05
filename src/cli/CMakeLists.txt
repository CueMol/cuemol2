include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(CLI_SRCS
TTYView.cpp
cli_main.cpp
)

file(TO_NATIVE_PATH "${CMAKE_INSTALL_PREFIX}/data/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message("DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
add_definitions(-DDEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")

SET(CLI_LINK_LIBRARIES
  pcre
  expat
  qmpng
  qmzlib
  qlib
  gfx
  qsys
  molstr
  molvis
  surface
  molanl
  symm
  xtal
  lwview
  render
  anim
  mdtools
  importers
  Boost::filesystem
  CGAL::CGAL
  )

if (BUILD_PYTHON_BINDINGS)
  list(APPEND CLI_LINK_LIBRARIES pybr)
  add_definitions(-DHAVE_PYTHON=1)
endif ()

add_executable(cuetty ${CLI_SRCS})
target_link_libraries(cuetty PRIVATE
  ${CLI_LINK_LIBRARIES}
  )

install(TARGETS cuetty
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )

set(DATA_FILES
${CMAKE_SOURCE_DIR}/src/xul_gui/data/prot_top.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/prot_props.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/nucl_top.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/nucl_props.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/sugar_top.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/mono_top.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/default_params.xml
${CMAKE_SOURCE_DIR}/src/xul_gui/data/symop.dat
${CMAKE_SOURCE_DIR}/src/xul_gui/data/default_style.xml
  )
set(SYSCONFIG_FILE ${CMAKE_SOURCE_DIR}/src/xul_gui/sysconfig.xml)

install(FILES ${DATA_FILES} DESTINATION data/data)
install(FILES ${SYSCONFIG_FILE} DESTINATION data)

# get_filename_component(LCMS2_LIB_DIR ${LCMS2_LIBRARIES} DIRECTORY)

# For VS Debug
set_target_properties(cuetty PROPERTIES
  VS_DEBUGGER_ENVIRONMENT "PATH=${BOOST_LIBRARYDIR};${CMAKE_PREFIX_PATH}/bin;%PATH%")
