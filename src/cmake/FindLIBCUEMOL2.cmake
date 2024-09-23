# - Try to find libcuemol2
#
# LIBCUEMOL2_FOUND
# LIBCUEMOL2_INCLUDE_DIR
# LIBCUEMOL2_LIBRARIES
#

find_path(LIBCUEMOL2_INCLUDE_DIR
    NAMES common.h
    PATHS
        "${LIBCUEMOL2_ROOT}/include"
        /usr/local/include
        /usr/include
    DOC
        "The directory where common.h resides"
)

find_library(LIBCUEMOL2_LIBRARIES
  NAMES qlib qsys 
  PATHS
  "${LIBCUEMOL2_ROOT}/lib"
  /usr/lib64
  /usr/lib
  /usr/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  /usr/local/lib64
  /usr/local/lib
  /usr/local/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  DOCS
  "The cuemol2 library"
  )


include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(LIBCUEMOL2 DEFAULT_MSG LIBCUEMOL2_LIBRARIES LIBCUEMOL2_INCLUDE_DIR)
get_filename_component(LIBCUEMOL2_LIBDIR ${LIBCUEMOL2_LIBRARIES} DIRECTORY)
mark_as_advanced(LIBCUEMOL2_INCLUDE_DIR LIBCUEMOL2_LIBRARIES LIBCUEMOL2_LIBDIR)

include(FindPackageMessage)
if (LIBCUEMOL2_FOUND)
  find_package_message(LIBCUEMOL2 "Found LIBCUEMOL2: ${LIBCUEMOL2_INCLUDE_DIR} ${LIBCUEMOL2_LIBRARIES}"
    "[${LIBCUEMOL2_LIBRARIES}][${LIBCUEMOL2_INCLUDE_DIR}]")
endif ()
