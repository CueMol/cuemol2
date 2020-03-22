# - Try to find LittleCMS2 (LCMS2)
#
# LCMS2_FOUND
# LCMS2_INCLUDE_DIR
# LCMS2_LIBRARIES
#

find_path(LCMS2_INCLUDE_DIR
    NAMES lcms2.h
    PATHS
        "${LCMS2_ROOT}/include"
        /usr/local/include
        /usr/include
    DOC
        "The directory where lcms2.h resides"
)

find_library(LCMS2_LIBRARIES
  NAMES lcms2
  PATHS
  "${LCMS2_ROOT}/lib"
  /usr/lib64
  /usr/lib
  /usr/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  /usr/local/lib64
  /usr/local/lib
  /usr/local/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  DOCS
  "The LittleCMS2 library"
  )


include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(LCMS2 DEFAULT_MSG LCMS2_LIBRARIES LCMS2_INCLUDE_DIR)

mark_as_advanced(LCMS2_INCLUDE_DIR LCMS2_LIBRARIES)
