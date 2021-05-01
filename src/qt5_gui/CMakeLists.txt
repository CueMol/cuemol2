include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Find includes in the build directories
set(CMAKE_INCLUDE_CURRENT_DIR ON)

# Turn on automatic invocation of the MOC, UIC & RCC
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)

# Find the QtWidgets library
find_package(Qt5 REQUIRED COMPONENTS Core Widgets OpenGL)
message(STATUS "Qt5Widgets_FOUND: ${Qt5Widgets_FOUND}")

SET(QT5GUI_SRCS
  qt5_gui.cpp
  QtGlDisplayContext2.cpp
  QtGlView2.cpp
  QtMolWidget2.cpp
  QtTimerImpl.cpp
  )

SET(QT5GUI_LINK_LIBRARIES
  qlib
  gfx
  qsys
  sysdep
  Boost::filesystem
  Qt5::OpenGL
  )

# ================================== Shiboken detection ======================================

SET(PYSIDE2_DIR "${Python3_SITELIB}/PySide2")
FILE(TO_NATIVE_PATH "${PYSIDE2_DIR}/examples/utils/pyside2_config.py" PYSIDE2_CONFIG)
MESSAGE(STATUS "PYSIDE2_CONFIG: ${Python3_EXECUTABLE} ${PYSIDE2_CONFIG}")

# Macro to get various pyside / python include / link flags and paths.
# Uses the not entirely supported utils/pyside2_config.py file.
macro(pyside2_config option output_var)
    if(${ARGC} GREATER 2)
        set(is_list ${ARGV2})
    else()
        set(is_list "")
    endif()

    #      COMMAND ${python_interpreter} "${CMAKE_SOURCE_DIR}/pyside2_config.py"
    execute_process(
      COMMAND ${Python3_EXECUTABLE} ${PYSIDE2_CONFIG}
              ${option}
      OUTPUT_VARIABLE ${output_var}
      OUTPUT_STRIP_TRAILING_WHITESPACE)

    if ("${${output_var}}" STREQUAL "")
        message(FATAL_ERROR "Error: Calling pyside2_config.py ${option} returned no output.")
    endif()
    if(is_list)
        string (REPLACE " " ";" ${output_var} "${${output_var}}")
    endif()
    MESSAGE(STATUS "PYSIDE2_CONFIG OK: ${output_var} ${${output_var}}")
endmacro()

# Query for the shiboken generator path, Python path, include paths and linker flags.
# pyside2_config(--shiboken2-module-path shiboken2_module_path)
pyside2_config(--shiboken2-generator-path shiboken2_generator_path)
# pyside2_config(--python-include-path python_include_dir)
pyside2_config(--shiboken2-generator-include-path shiboken_include_dir 1)
pyside2_config(--shiboken2-module-shared-libraries-cmake shiboken_shared_libraries 0)
# pyside2_config(--python-link-flags-cmake python_linking_data 0)
pyside2_config(--pyside2-shared-libraries-cmake pyside2_link 0)

set(shiboken_path "${shiboken2_generator_path}/shiboken2${CMAKE_EXECUTABLE_SUFFIX}")
if(NOT EXISTS ${shiboken_path})
    message(FATAL_ERROR "Shiboken executable not found at path: ${shiboken_path}")
endif()

MESSAGE(STATUS "shiboken path: ${shiboken_path}")

# ====================== Shiboken target for generating binding C++ files  ====================

list(GET Qt5Core_INCLUDE_DIRS 0 QT_INCLUDE_DIR)
message(STATUS "*** QT_INCLUDE_DIR= ${QT_INCLUDE_DIR}")
get_target_property(QtCore_is_framework Qt5::Core FRAMEWORK)
if (QtCore_is_framework)
    # Get the path to the framework dir.
    get_filename_component(QT_FRAMEWORK_INCLUDE_DIR "${QT_INCLUDE_DIR}/../" ABSOLUTE)
    message(STATUS "*** QT_FRAMEWORK_INCLUDE_DIR is ${QT_FRAMEWORK_INCLUDE_DIR}")

    # QT_INCLUDE_DIR points to the QtCore.framework directory, so we need to adjust this to point
    # to the actual include directory, which has include files for non-framework parts of Qt.
    get_filename_component(QT_INCLUDE_DIR "${QT_INCLUDE_DIR}/../../include" ABSOLUTE)
endif()

message(STATUS "*** computed QT_INCLUDE_DIR as ${QT_INCLUDE_DIR}")

set(shiboken_framework_include_dirs_option "")
if (CMAKE_HOST_APPLE)
  set(shiboken_framework_include_dirs "${QT_FRAMEWORK_INCLUDE_DIR}")
  # make_path(shiboken_framework_include_dirs ${shiboken_framework_include_dirs})
  set(shiboken_framework_include_dirs_option "--framework-include-paths=${shiboken_framework_include_dirs}")
  message(STATUS "*** shiboken_framework_include_dirs_option= ${shiboken_framework_include_dirs_option}")
endif ()

##########

if (WIN32)
  # semicolon should be escaped twice
  set(PATH_SEP "\\\;")
else()
  set(PATH_SEP ":")
endif()

# string(REPLACE ";" "${PATH_SEP}" core_includes "${Qt5Core_INCLUDE_DIRS}")
set(shiboken_include_dirs ${QT_INCLUDE_DIR})
list(APPEND shiboken_include_dirs ${Qt5Core_INCLUDE_DIRS})
string(REPLACE ";" "${PATH_SEP}" shiboken_include_dirs "${shiboken_include_dirs}")
# MESSAGE(STATUS "shiboken_include_dirs: ${shiboken_include_dirs}")


# Set up the options to pass to shiboken.
set(shiboken_options --generator-set=shiboken --enable-parent-ctor-heuristic
    --enable-return-value-heuristic --use-isnull-as-nb_nonzero
    --avoid-protected-hack
    --enable-pyside-extensions
    ${shiboken_framework_include_dirs_option}
    --include-paths=${shiboken_include_dirs}
    # ${lib_includes}
    -I${CMAKE_CURRENT_SOURCE_DIR}
    -T${CMAKE_CURRENT_SOURCE_DIR}
    -T${PYSIDE2_DIR}/typesystems/
    --output-directory=${CMAKE_CURRENT_BINARY_DIR}
    )
# MESSAGE(STATUS "shiboken_options: ${shiboken_options}")

set(wrapped_header ${CMAKE_CURRENT_SOURCE_DIR}/bindings.h)
set(typesystem_file ${CMAKE_CURRENT_SOURCE_DIR}/bindings.xml)
set(generated_sources
  ${CMAKE_CURRENT_BINARY_DIR}/qt5gui/qtmolwidget2_wrapper.cpp
  ${CMAKE_CURRENT_BINARY_DIR}/qt5gui/qt5gui_module_wrapper.cpp)


set(generated_sources_dependencies ${wrapped_header} ${typesystem_file})

# Add custom target to run shiboken to generate the binding cpp files.
add_custom_command(OUTPUT ${generated_sources}
  COMMAND ${shiboken_path}
  ${shiboken_options} ${wrapped_header} ${typesystem_file}
  DEPENDS ${generated_sources_dependencies}
  IMPLICIT_DEPENDS CXX ${wrapped_header}
  WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
  COMMENT "Running generator for ${typesystem_file}.")


# =============================== CMake target - qt5gui ===============================

Python3_add_library(qt5gui MODULE ${QT5GUI_SRCS} ${MCWG_HEADERS} ${generated_sources})
# MCWRAPGEN_PYWRAPPERS(qt5gui)
target_link_libraries(qt5gui PRIVATE ${QT5GUI_LINK_LIBRARIES} ${shiboken_shared_libraries} ${pyside2_link})

# target_include_directories(qt5gui PRIVATE ${QT_INCLUDE_DIR} ${Qt5OpenGL_INCLUDE_DIRS})
target_include_directories(qt5gui PRIVATE ${PYSIDE2_DIR}/include/)
target_include_directories(qt5gui PRIVATE ${PYSIDE2_DIR}/include/QtCore)
target_include_directories(qt5gui PRIVATE ${PYSIDE2_DIR}/include/QtWidgets)
target_include_directories(qt5gui PRIVATE ${PYSIDE2_DIR}/include/QtGui)
target_include_directories(qt5gui PRIVATE ${PYSIDE2_DIR}/include/QtOpenGL)
target_include_directories(qt5gui PRIVATE ${shiboken_include_dir})

if (WIN32)
  set_target_properties(qt5gui PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
else ()
  set_target_properties(qt5gui PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})
endif ()

# set_property(TARGET qt5gui PROPERTY PREFIX "")
# Needed mostly on Windows to export symbols, and create a .lib file, otherwise the binding
# library can't link to the sample library.
# target_compile_definitions(qt5gui PRIVATE BINDINGS_BUILD)

# For VS Debug
set_target_properties(qt5gui PROPERTIES
  VS_DEBUGGER_COMMAND "${Python3_EXECUTABLE}"
  VS_DEBUGGER_COMMAND_ARGUMENTS "${CMAKE_SOURCE_DIR}/src/python/cuemol_gui/startup.py"
  VS_DEBUGGER_WORKING_DIRECTORY "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/${CMAKE_CFG_INTDIR}"
  VS_DEBUGGER_ENVIRONMENT "PYTHONPATH=${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/${CMAKE_CFG_INTDIR};${CMAKE_SOURCE_DIR}/src/python;${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/python
CUEMOL_DLL_DIR=${CMAKE_PREFIX_PATH}\\bin;${CMAKE_PREFIX_PATH}\\boost\\boost_1_72_0\\lib64-msvc-14.2
CUEMOL_SYSCONFIG_PATH=${CMAKE_SOURCE_DIR}/src/xul_gui"
  )
