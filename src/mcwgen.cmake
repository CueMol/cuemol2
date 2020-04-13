SET(MCWRAPGEN "perl ${CMAKE_SOURCE_DIR}/src/perl/mcwrapgen3.pl")

if (WIN32)
  SET(MCWRAPGEN "${MCWRAPGEN} -MSVC")
endif()

SET(MCWG_INCLUDES "-D HAVE_CONFIG_H -I ${CMAKE_SOURCE_DIR}/src -I ${CMAKE_BINARY_DIR}/src -I ${CMAKE_CURRENT_SOURCE_DIR}")
SET(MCWG_SRC_CMD "${MCWRAPGEN} ${MCWG_INCLUDES} -m src")
SET(MCWG_HDR_CMD "${MCWRAPGEN} ${MCWG_INCLUDES} -m hdr")
SET(MCWG_MOD_CMD "${MCWRAPGEN} ${MCWG_INCLUDES} -m mod")
if (BUILD_PYTHON_BINDINGS)
  SET(MCWG_PY_CMD "${MCWRAPGEN} ${MCWG_INCLUDES} -m py")
endif ()

macro(MCWRAPGEN_CLASS _target_sources)
  foreach(_current_file ${ARGN})
    SET(_abs_file "${CMAKE_CURRENT_SOURCE_DIR}/${_current_file}")

    get_filename_component(_file_dir ${_abs_file} DIRECTORY)
    get_filename_component(_file_name ${_abs_file} NAME)
    get_filename_component(_file_stem ${_file_name} NAME_WE)

    SET(_out_cpp_file "${_file_dir}/${_file_stem}_wrap.cpp")
    SET(_out_hpp_file "${_file_dir}/${_file_stem}_wrap.hpp")
    # message(STATUS "MCWG file ${_file}")
    # message(STATUS "MCWG file output ${_out_cpp_file}")
    # message(STATUS "MCWG file output ${_out_hpp_file}")

    # SPLIT_ARGS(_cmd_xx ${MCWG_SRC_CMD})
    separate_arguments(_mcwg_source_command NATIVE_COMMAND "${MCWG_SRC_CMD}")
    add_custom_command(
      OUTPUT ${_out_cpp_file}
      COMMAND ${_mcwg_source_command} ${_abs_file}
      )

    separate_arguments(_mcwg_header_command NATIVE_COMMAND "${MCWG_HDR_CMD}")
    add_custom_command(
      OUTPUT ${_out_hpp_file}
      COMMAND ${_mcwg_header_command} ${_abs_file}
      )

    # set(${_target_sources} ${${_target_sources}} ${_out_cpp_file})
    list(APPEND ${_target_sources} ${_out_cpp_file})
    list(APPEND MCWG_HEADERS ${_out_hpp_file})
    
    if (BUILD_PYTHON_BINDINGS)
      
      SET(_out_py_file "${CMAKE_CURRENT_BINARY_DIR}/${_file_stem}.py")
      separate_arguments(_mcwg_py_command NATIVE_COMMAND "${MCWG_PY_CMD}")
      add_custom_command(
	OUTPUT ${_out_py_file}
	COMMAND ${_mcwg_py_command} -pydir ${CMAKE_CURRENT_BINARY_DIR} ${_abs_file}
	)
      list(APPEND MCWG_PY_WRAPPERS ${_out_py_file})
    endif ()

  endforeach()

  message("MCWG_PY_WRAPPERS: ${MCWG_PY_WRAPPERS}")
endmacro()

macro(MCWRAPGEN_MODULE _target_sources _target_moddef)
  # message("MCWRAPGEN_MODULE: _target_sources ${_target_sources}")
  # message("MCWRAPGEN_MODULE: _depends ${ARGN}")
  # message("MCWRAPGEN_MODULE: _target_moddef ${_target_moddef}")

  SET(_depends "${ARGN}")
  SET(_abs_file "${CMAKE_CURRENT_SOURCE_DIR}/${_target_moddef}")
  get_filename_component(_file_stem ${_target_moddef} NAME_WE)
  SET(_out_cpp_file "${CMAKE_CURRENT_SOURCE_DIR}/${_file_stem}_loader.cpp")
  separate_arguments(_mcwg_module_command NATIVE_COMMAND "${MCWG_MOD_CMD}")
  # message(${_mcwg_module_command})
  add_custom_command(
    OUTPUT ${_out_cpp_file}
    COMMAND ${_mcwg_module_command} ${_abs_file}
    DEPENDS ${_depends}
    )
  list(APPEND ${_target_sources} ${_out_cpp_file})
  # message(STATUS "LOADER file ${_out_cpp_file}")
  
endmacro()

macro(MCWRAPGEN_PYWRAPPERS _target)
  if (BUILD_PYTHON_BINDINGS)
    add_custom_target(${_target}_generate_pywrappers DEPENDS ${MCWG_PY_WRAPPERS})
    add_dependencies(${_target} ${_target}_generate_pywrappers)
    install(FILES ${MCWG_PY_WRAPPERS} DESTINATION data/python/cuemol/wrappers)
  endif ()
endmacro()
