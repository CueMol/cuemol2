include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  )

SET(ZLIB_SRCS
adler32.c	deflate.c	gzread.c	inffast.c	trees.c
compress.c	gzclose.c	gzwrite.c	inflate.c	uncompr.c
crc32.c		gzlib.c		infback.c	inftrees.c	zutil.c)

if (WIN32)
else()
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
endif()

add_library(qmzlib STATIC ${ZLIB_SRCS})
