SET(ZLIB_SRCS
adler32.c	deflate.c	gzread.c	inffast.c	trees.c
compress.c	gzclose.c	gzwrite.c	inflate.c	uncompr.c
crc32.c		gzlib.c		infback.c	inftrees.c	zutil.c)

SET(ZLIB_HDRS
crc32.h		deflate.h	gzguts.h	inffast.h	inffixed.h
inflate.h	inftrees.h	trees.h		zconf.h		zlib.h		zutil.h
)

##########

add_library(qmzlib STATIC)

target_sources(qmzlib PRIVATE ${ZLIB_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${ZLIB_HDRS}
)

target_include_directories(
  qmzlib PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
)

if (WIN32)
else()
  # set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
  target_compile_options(qmzlib PUBLIC "-fPIC")
endif()

# Vendored upstream library: suppress all build warnings.
# The source is re-synced from upstream, so it is not hand-edited to fix warnings.
target_compile_options(qmzlib PRIVATE $<IF:$<C_COMPILER_ID:MSVC>,/w,-w>)

# install(TARGETS qmzlib
#   FILE_SET HEADERS
# )
