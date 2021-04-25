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

    # Set output directory
    get_filename_component(_out_dir ${_abs_file} DIRECTORY)

    get_filename_component(_file_name ${_abs_file} NAME)
    get_filename_component(_file_stem ${_file_name} NAME_WE)

    SET(_out_cpp_file "${_out_dir}/${_file_stem}_wrap.cpp")
    SET(_out_hpp_file "${_out_dir}/${_file_stem}_wrap.hpp")
    # message(STATUS "MCWG file ${_file}")
    # message(STATUS "MCWG file output ${_out_cpp_file}")
    # message(STATUS "MCWG file output ${_out_hpp_file}")

    separate_arguments(_mcwg_source_command NATIVE_COMMAND "${MCWG_SRC_CMD}")
    add_custom_command(
      OUTPUT ${_out_cpp_file}
      COMMAND ${_mcwg_source_command} ${_abs_file}
      DEPENDS ${_abs_file}
      )

    separate_arguments(_mcwg_header_command NATIVE_COMMAND "${MCWG_HDR_CMD}")
    add_custom_command(
      OUTPUT ${_out_hpp_file}
      COMMAND ${_mcwg_header_command} ${_abs_file}
      DEPENDS ${_abs_file}
      )

    # set(${_target_sources} ${${_target_sources}} ${_out_cpp_file})
    list(APPEND ${_target_sources} ${_out_cpp_file})
    list(APPEND MCWG_HEADERS ${_out_hpp_file})
    
    # Generate python wrapper scripts
    if (BUILD_PYTHON_BINDINGS)
      if (WIN32)
        SET(_out_py_dir "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/python/wrappers")
      else ()
        SET(_out_py_dir "${CMAKE_BINARY_DIR}/python/wrappers")
      endif()
      SET(_out_py_file "${_out_py_dir}/${_file_stem}.py")
      separate_arguments(_mcwg_py_command NATIVE_COMMAND "${MCWG_PY_CMD}")
      add_custom_command(
	    OUTPUT ${_out_py_file}
	    COMMAND ${_mcwg_py_command} -pydir ${_out_py_dir} ${_abs_file}
        DEPENDS ${_abs_file}
	    )
      list(APPEND MCWG_PY_WRAPPERS ${_out_py_file})
    endif ()

  endforeach()

  # message("MCWG_PY_WRAPPERS: ${MCWG_PY_WRAPPERS}")
endmacro()

macro(MCWRAPGEN_MODULE _target_sources _target_moddef)
  # message("MCWRAPGEN_MODULE: _target_sources ${_target_sources}")
  # message("MCWRAPGEN_MODULE: _depends ${ARGN}")
  # message("MCWRAPGEN_MODULE: _target_moddef ${_target_moddef}")

  # Set output directory
  # SET(_out_dir "${CMAKE_CURRENT_BINARY_DIR}")
  SET(_out_dir "${CMAKE_CURRENT_SOURCE_DIR}")

  SET(_depends "${ARGN}")
  SET(_abs_file "${CMAKE_CURRENT_SOURCE_DIR}/${_target_moddef}")
  get_filename_component(_file_stem ${_target_moddef} NAME_WE)
  SET(_out_cpp_file "${_out_dir}/${_file_stem}_loader.cpp")
  separate_arguments(_mcwg_module_command NATIVE_COMMAND "${MCWG_MOD_CMD}")
  # message(${_mcwg_module_command})
  add_custom_command(
    OUTPUT ${_out_cpp_file}
    COMMAND ${_mcwg_module_command} ${_abs_file}
    DEPENDS ${_depends} ${_abs_file}
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
