SET(EXPAT_SRCS
  xmlparse.c
  xmlrole.c
  xmltok.c
  xmltok_impl.c)

SET(EXPAT_HDRS
amigaconfig.h
ascii.h
asciitab.h
expat.h
expat_external.h
iasciitab.h
internal.h
latin1tab.h
macconfig.h
nametab.h
utf8tab.h
winconfig.h
xmlrole.h
xmltok.h
xmltok_impl.h
)

#####

add_library(qmexpat STATIC)

target_sources(qmexpat
  PRIVATE ${EXPAT_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${EXPAT_HDRS}
  )

if (WIN32)
  # add_definitions(-DCOMPILED_FROM_DSP)
  target_compile_definitions(qmexpat PUBLIC COMPILED_FROM_DSP)
else()
  # target_compile_options(qmexpat PUBLIC "-fPIC")
  set_property(TARGET qmexpat PROPERTY POSITION_INDEPENDENT_CODE ON)
  # add_definitions(-DHAVE_EXPAT_CONFIG_H=1)
  target_compile_definitions(qmexpat PUBLIC HAVE_EXPAT_CONFIG_H=1)

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

target_include_directories(
  qmexpat PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${CMAKE_CURRENT_BINARY_DIR}
  )

# Vendored upstream library: suppress all build warnings.
# The source is re-synced from upstream, so it is not hand-edited to fix warnings.
target_compile_options(qmexpat PRIVATE $<IF:$<C_COMPILER_ID:MSVC>,/w,-w>)

# install(TARGETS qmexpat
#   FILE_SET HEADERS
# )
