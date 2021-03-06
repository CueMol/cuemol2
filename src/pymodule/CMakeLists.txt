
add_definitions(-DHAVE_PYTHON=1 -DBUILD_PYMODULE=1)

if (WIN32)
  add_definitions(-DPYBR_EXPORTS=1)
endif()

if (BUILD_MINIMUM_MODULES)
  add_definitions(-DPYBR_MINIMUM_MODULES=1)
endif ()

include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${Python3_INCLUDE_DIRS}
  )

# Normal C++ source files
SET(PYMODULE_SRCS
../pybr/wrapper.cpp
../pybr/convert.cpp
../pybr/methodobj.cpp
../pybr/initcuemol.cpp
  )

SET(PYMODULE_LINK_LIBRARIES
  pcre
  expat
  qmpng
  qmzlib
  qlib
  )

if (NOT BUILD_MINIMUM_MODULES)
  list(APPEND PYMODULE_LINK_LIBRARIES
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
    )
endif ()

list(APPEND PYMODULE_LINK_LIBRARIES
  Boost::filesystem
  Python3::Python
  )

# add_library(_cuemol_internal SHARED ${PYMODULE_SRCS})
Python3_add_library(_cuemol_internal MODULE ${PYMODULE_SRCS})
target_link_libraries(_cuemol_internal PRIVATE ${PYMODULE_LINK_LIBRARIES})

if (WIN32)
  set_target_properties(_cuemol_internal PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
else ()
  set_target_properties(_cuemol_internal PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
endif ()

# get_target_property(_cuemol_internal_location _cuemol_internal LIBRARY_OUTPUT_DIRECTORY)
# message (STATUS "_cuemol_internal_location == ${_cuemol_internal_location}")
# set_target_properties(_cuemol_internal PROPERTIES PREFIX "")  # no 'lib' prefix
# set_target_properties(_cuemol_internal PROPERTIES SUFFIX ".${Python3_SOABI}")  # must be .so (not .dylib)

# install(TARGETS _cuemol_internal
#   RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
#   LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
#   )

