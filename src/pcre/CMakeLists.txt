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

add_library(pcre STATIC)

target_sources(pcre PRIVATE ${PCRE_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${PCRE_HDRS}
)

target_include_directories(
  pcre PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
)

# add_definitions(-DPOSIX_MALLOC_THRESHOLD=10)
target_compile_definitions(pcre PUBLIC POSIX_MALLOC_THRESHOLD=10)

if (WIN32)
else()
  # set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
  target_compile_options(pcre PUBLIC "-fPIC")
endif()

install(TARGETS pcre
  FILE_SET HEADERS
)

message(STATUS "PCRE_SRCS ${PCRE_SRCS}")
