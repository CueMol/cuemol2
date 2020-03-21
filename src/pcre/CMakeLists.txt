include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  )

SET(PCRE_SRCS
  get.c
  maketables.c
  pcre.c
  study.c)

add_definitions(-DPOSIX_MALLOC_THRESHOLD=10)

if (WIN32)
else()
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
endif()

add_library(pcre STATIC ${PCRE_SRCS})

message(STATUS "PCRE_SRCS ${PCRE_SRCS}")
