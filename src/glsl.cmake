#==============================================================================
# GLSL_PREPROC macro definition
#  Global vars:
#    SHADER_INCLUDE_DIRS - list of include directories
#    SHADER_DEFINES - list of macro definitions
#==============================================================================

#
# GLSL_PREPROC macro with dependency tracking
#
function(GLSL_PREPROC _target SHADER_DEPENDENCIES)
    # Get shader sources from target
    get_target_property(TARGET_SHADER_SOURCES ${_target} SHADER_SOURCES)

    MESSAGE(STATUS "Configuring GLSL_PREPROC for target: ${_target} deps: ${SHADER_DEPENDENCIES}")
    
    if(NOT TARGET_SHADER_SOURCES)
        message(FATAL_ERROR "Target ${_target} does not have SHADER_SOURCES property")
    endif()
    
    # Set output directories
    set(SHADER_OUTPUT_DIR "${CMAKE_BINARY_DIR}/processed_shaders")
    set(SHADER_INSTALL_DIR "share/data/shaders")
    
    # Create output directory
    file(MAKE_DIRECTORY ${SHADER_OUTPUT_DIR})
    
    # Detect and build preprocessor command
    set(PREPROCESSOR_CMD)
    set(PREPROCESSOR_FLAGS)
    
    if(MSVC)
        # Use MSVC (cl.exe)
        find_program(CL_EXECUTABLE cl)
        if(NOT CL_EXECUTABLE)
            message(FATAL_ERROR "MSVC cl.exe not found")
        endif()
        
        set(PREPROCESSOR_CMD "${CL_EXECUTABLE}")
        list(APPEND PREPROCESSOR_FLAGS /EP)  # Preprocessor output only
        list(APPEND PREPROCESSOR_FLAGS /C)   # Preserve comments
        list(APPEND PREPROCESSOR_FLAGS /nologo)  # Hide logo
        
        # Add include directories
        foreach(INCLUDE_DIR ${SHADER_INCLUDE_DIRS})
            file(TO_NATIVE_PATH "${INCLUDE_DIR}" NATIVE_INCLUDE_DIR)
            list(APPEND PREPROCESSOR_FLAGS "/I${NATIVE_INCLUDE_DIR}")
        endforeach()
        
        # Add macro definitions
        foreach(DEFINE ${SHADER_DEFINES})
            list(APPEND PREPROCESSOR_FLAGS "/D${DEFINE}")
        endforeach()
        
    else()
        # GCC/Clang/other Unix compilers
        find_program(CPP_EXECUTABLE cpp)
        if(NOT CPP_EXECUTABLE)
            # If cpp is not available on system, use gcc preprocessor
            find_program(GCC_EXECUTABLE gcc)
            if(GCC_EXECUTABLE)
                set(PREPROCESSOR_CMD "${GCC_EXECUTABLE}")
                list(APPEND PREPROCESSOR_FLAGS -E)  # Run preprocessor only
            else()
                message(FATAL_ERROR "No suitable C preprocessor found")
            endif()
        else()
            set(PREPROCESSOR_CMD "${CPP_EXECUTABLE}")
        endif()
        
        list(APPEND PREPROCESSOR_FLAGS -P)  # Don't output #line directives
        list(APPEND PREPROCESSOR_FLAGS -C)  # Preserve comments
        list(APPEND PREPROCESSOR_FLAGS -w)  # Suppress warnings
        
        # Add include directories
        foreach(INCLUDE_DIR ${SHADER_INCLUDE_DIRS})
            list(APPEND PREPROCESSOR_FLAGS "-I${INCLUDE_DIR}")
        endforeach()
        
        # Add macro definitions
        foreach(DEFINE ${SHADER_DEFINES})
            list(APPEND PREPROCESSOR_FLAGS "-D${DEFINE}")
        endforeach()
    endif()
    
    # List of processed shader files
    set(PROCESSED_SHADERS)
    set(INSTALL_SHADERS)
    
    # Process each shader file with dependency detection
    foreach(SHADER_SOURCE ${TARGET_SHADER_SOURCES})
        # Get absolute path of input file
        get_filename_component(SHADER_ABS_PATH "${SHADER_SOURCE}" ABSOLUTE)
        
        # Generate output filename (preserve original filename)
        get_filename_component(SHADER_NAME "${SHADER_SOURCE}" NAME)
        set(PROCESSED_SHADER "${SHADER_OUTPUT_DIR}/${SHADER_NAME}")
        
        # Detect dependencies for this shader
        # DETECT_SHADER_DEPENDENCIES("${SHADER_ABS_PATH}" SHADER_DEPENDENCIES)
        
        # Create preprocessing command with full dependency list
        if(MSVC)
            # For MSVC, use output redirection
            add_custom_command(
                OUTPUT "${PROCESSED_SHADER}"
                COMMAND ${PREPROCESSOR_CMD} ${PREPROCESSOR_FLAGS} "${SHADER_ABS_PATH}" > "${PROCESSED_SHADER}"
                DEPENDS "${SHADER_ABS_PATH}" ${SHADER_DEPENDENCIES}
                COMMENT "Preprocessing shader: ${SHADER_NAME}"
                VERBATIM
            )
        else()
            # For Unix systems
            add_custom_command(
                OUTPUT "${PROCESSED_SHADER}"
                COMMAND ${PREPROCESSOR_CMD} ${PREPROCESSOR_FLAGS} "${SHADER_ABS_PATH}" > "${PROCESSED_SHADER}"
                DEPENDS "${SHADER_ABS_PATH}" ${SHADER_DEPENDENCIES}
                COMMENT "Preprocessing shader: ${SHADER_NAME}"
                # COMMENT "${PREPROCESSOR_CMD} ${PREPROCESSOR_FLAGS} ${SHADER_ABS_PATH} > ${PROCESSED_SHADER}"
                VERBATIM
            )
        endif()
        
        list(APPEND PROCESSED_SHADERS "${PROCESSED_SHADER}")
        list(APPEND INSTALL_SHADERS "${PROCESSED_SHADER}")
        
        # Output dependency info for debugging
        list(LENGTH SHADER_DEPENDENCIES DEP_COUNT)
        message(STATUS "Shader ${SHADER_NAME} depends on ${DEP_COUNT} files:")
        foreach(DEP ${SHADER_DEPENDENCIES})
            get_filename_component(DEP_NAME "${DEP}" NAME)
            message(STATUS "  - ${DEP_NAME}")
        endforeach()
    endforeach()
    
    # Create custom target
    set(SHADER_TARGET "${_target}_shaders")
    add_custom_target(${SHADER_TARGET} ALL
        DEPENDS ${PROCESSED_SHADERS}
        COMMENT "Processing shaders for target: ${_target}"
    )
    
    # Add dependency to main target
    add_dependencies(${_target} ${SHADER_TARGET})
    
    # Install configuration
    foreach(PROCESSED_SHADER ${INSTALL_SHADERS})
        get_filename_component(SHADER_NAME "${PROCESSED_SHADER}" NAME)
        install(FILES "${PROCESSED_SHADER}"
                DESTINATION "${SHADER_INSTALL_DIR}"
                RENAME "${SHADER_NAME}")
    endforeach()
    
    # Output debug information
    message(STATUS "GLSL_PREPROC configured for target: ${_target}")
    message(STATUS "  - Shader: ${PROCESSED_SHADERS}")
    message(STATUS "  - Output directory: ${SHADER_OUTPUT_DIR}")
    message(STATUS "  - Install directory: ${SHADER_INSTALL_DIR}")
    message(STATUS "  - Preprocessor: ${PREPROCESSOR_CMD}")
    
endfunction()
