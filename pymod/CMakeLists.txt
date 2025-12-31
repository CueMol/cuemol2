cmake_minimum_required(VERSION 3.15...3.26)
project(${SKBUILD_PROJECT_NAME} LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_OUTPUT_EXTENSION_REPLACE 1)  # ref. https://texus.me/2015/09/06/cmake-and-gcov/

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
# Python3
find_package(
  Python3
  COMPONENTS Interpreter Development.Module
  REQUIRED)
message(STATUS "Python3_Development.Module_FOUND=${Python3_Development.Module_FOUND}")
message(STATUS "Python3_EXECUTABLE=${Python3_EXECUTABLE}")
message(STATUS "Python: version=${Python3_VERSION}")
message(STATUS "Python3_INCLUDE_DIRS=${Python3_INCLUDE_DIRS}")
message(STATUS "Python3_LIBRARIES=${Python3_LIBRARIES}")

find_package(Python3 COMPONENTS NumPy)
message(STATUS "Python3_NumPy_FOUND=${Python3_NumPy_FOUND}")
if (Python3_NumPy_FOUND)
  add_definitions(-DHAVE_NUMPY=1)
endif()

#####################

add_definitions(-DHAVE_PYTHON=1 -DBUILD_PYMODULE=1)
if (WIN32)
  add_definitions(-DPYBR_EXPORTS=1)
endif()

# Dependent libs
SET(PYMOD_LINK_LIBRARIES
  cuemol2
  Python3::NumPy
  # Boost::filesystem
)

# Normal C++ source files
SET(PYMODULE_SRCS
  src/wrapper.cpp
  src/convert.cpp
  src/methodobj.cpp
  src/initcuemol.cpp
)

if (Python3_NumPy_FOUND)
  list(APPEND PYMODULE_SRCS src/ndarray_wrap.cpp)
endif()

python3_add_library(_cuemol_internal MODULE ${PYMODULE_SRCS} WITH_SOABI)

target_include_directories(
  _cuemol_internal PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  ${LIBCUEMOL2_INCLUDE_DIR}
)
target_link_directories(
  _cuemol_internal PRIVATE
  ${LIBCUEMOL2_LIBDIR}
)
target_link_libraries(_cuemol_internal PRIVATE
  ${PYMOD_LINK_LIBRARIES}
)


file(TO_NATIVE_PATH "${LIBCUEMOL2_ROOT}/data/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message(STATUS "DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
target_compile_definitions(_cuemol_internal PUBLIC DEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")
target_compile_definitions(_cuemol_internal PUBLIC LINK_SHARED)

# if (WIN32)
#   set_target_properties(_cuemol_internal PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
# else ()
#   set_target_properties(_cuemol_internal PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
# endif ()

install(TARGETS _cuemol_internal DESTINATION .)

if (APPLE)
  set_target_properties(_cuemol_internal PROPERTIES
    INSTALL_RPATH "@loader_path/lib"
    BUILD_WITH_INSTALL_RPATH TRUE)

  install(FILES
    ${LIBCUEMOL2_LIBDIR}/libcuemol2.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_atomic.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_date_time.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_iostreams.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_thread.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_chrono.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_filesystem.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_system.dylib
    ${LIBCUEMOL2_LIBDIR}/libboost_timer.dylib
    DESTINATION ./lib)
endif ()

# configure_file(
#   "${PROJECT_SOURCE_DIR}/python/cuemol/__init__.py.in"
#   "${PROJECT_BINARY_DIR}/python/cuemol/__init__.py")
# install(FILES "${PROJECT_BINARY_DIR}/python/cuemol/__init__.py" DESTINATION cuemol)

# install(FILES "${LIBCUEMOL2_ROOT}/data/python/cuemol/wrappers/Vector.py" DESTINATION "${PROJECT_SOURCE_DIR}/python/cuemol/wrappers")
# install(DIRECTORY "${LIBCUEMOL2_ROOT}/data/python/cuemol/wrappers" DESTINATION "${PROJECT_SOURCE_DIR}/python/cuemol")
