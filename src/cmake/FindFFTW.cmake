# - Try to find FFTW3
#
# FFTW_FOUND
# FFTW_INCLUDE_DIR
# FFTW_LIBRARIES
#

find_path(FFTW_INCLUDE_DIR
    NAMES fftw3.h
    PATHS
        "${FFTW_ROOT}/include"
        /usr/local/include
        /usr/include
    DOC
        "The directory where fftw3.h resides"
)

# Find FFTW3 float library
# (only float version is used in CueMol)
find_library(FFTW_LIBRARIES
  NAMES fftw3f libfftw3f-3
  PATHS
  "${FFTW_ROOT}/lib"
  /usr/lib64
  /usr/lib
  /usr/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  /usr/local/lib64
  /usr/local/lib
  /usr/local/lib/${CMAKE_LIBRARY_ARCHITECTURE}
  DOCS
  "The fftw3 library"
  )


include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(FFTW DEFAULT_MSG FFTW_LIBRARIES FFTW_INCLUDE_DIR)

mark_as_advanced(FFTW_INCLUDE_DIR FFTW_LIBRARIES)

include(FindPackageMessage)
if (FFTW_FOUND)
  find_package_message(FFTW "Found FFTW: ${FFTW_INCLUDE_DIR} ${FFTW_LIBRARIES}"
    "[${FFTW_LIBRARIES}][${FFTW_INCLUDE_DIR}]")
endif ()
