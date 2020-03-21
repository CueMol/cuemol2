include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${CMAKE_CURRENT_BINARY_DIR}
  )

#####

SET(EXPAT_SRCS
  xmlparse.c
  xmlrole.c
  xmltok.c
  xmltok_impl.c)

if (WIN32)
  add_definitions(-DCOMPILED_FROM_DSP)
else()
  set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
  add_definitions(-DHAVE_EXPAT_CONFIG_H=1)

  include(TestBigEndian)
  test_big_endian(WORDS_BIGENDIAN)
  
  if(WORDS_BIGENDIAN)
    set(BYTEORDER 4321)
  else(WORDS_BIGENDIAN)
    set(BYTEORDER 1234)
  endif(WORDS_BIGENDIAN)
  
  include(CheckSymbolExists)
  check_symbol_exists("memmove" "string.h" HAVE_MEMMOVE)
  
  configure_file(${CMAKE_CURRENT_SOURCE_DIR}/expat_config_cmake.h.in
    ${CMAKE_CURRENT_BINARY_DIR}/expat_config.h
    @ONLY)
endif()

add_library(expat STATIC ${EXPAT_SRCS})

