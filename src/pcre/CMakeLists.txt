SET(PCRE_SRCS
  get.c
  maketables.c
  pcre.c
  study.c)

SET(PCRE_HDRS
config.h
internal.h
pcre.h
)

##########

add_library(qmpcre STATIC)

target_sources(qmpcre PRIVATE ${PCRE_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${PCRE_HDRS}
)

target_include_directories(
  qmpcre PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
)

# add_definitions(-DPOSIX_MALLOC_THRESHOLD=10)
target_compile_definitions(qmpcre PUBLIC POSIX_MALLOC_THRESHOLD=10)

if (WIN32)
else()
  # target_compile_options(qmpcre PUBLIC "-fPIC")
  set_property(TARGET qmpcre PROPERTY POSITION_INDEPENDENT_CODE ON)
endif()

# Vendored upstream library: suppress all build warnings.
# The source is re-synced from upstream, so it is not hand-edited to fix warnings.
target_compile_options(qmpcre PRIVATE $<IF:$<C_COMPILER_ID:MSVC>,/w,-w>)

# install(TARGETS qmpcre
#   FILE_SET HEADERS
# )

message(STATUS "PCRE_SRCS ${PCRE_SRCS}")
