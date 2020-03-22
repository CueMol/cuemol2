include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/zlib
  ${CMAKE_BINARY_DIR}/src
  )

SET(PNG_SRCS
png.c		pngmem.c	pngrio.c	pngset.c	pngwrite.c
pngerror.c	pngpread.c	pngrtran.c	pngtrans.c	pngwtran.c
pngget.c	pngread.c	pngrutil.c	pngwio.c	pngwutil.c)

if (WIN32)
else()
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
endif()

add_library(qmpng STATIC ${PNG_SRCS})
