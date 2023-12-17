SET(PNG_SRCS
png.c		pngmem.c	pngrio.c	pngset.c	pngwrite.c
pngerror.c	pngpread.c	pngrtran.c	pngtrans.c	pngwtran.c
pngget.c	pngread.c	pngrutil.c	pngwio.c	pngwutil.c)

SET(PNG_HDRS
  png.h pngconf.h pngdebug.h pnginfo.h pnglibconf.h pngpriv.h pngstruct.h
)

##########

add_library(qmpng STATIC)

target_sources(qmpng PRIVATE ${PNG_SRCS}
  PUBLIC FILE_SET HEADERS 
  BASE_DIRS ${PROJECT_SOURCE_DIR}/src
  FILES ${PNG_HDRS}
)

target_include_directories(
  qmpng PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/zlib
  ${CMAKE_BINARY_DIR}/src
)

if (WIN32)
else()
  # set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
  target_compile_options(qmpng PUBLIC "-fPIC")
endif()

install(TARGETS qmpng
  FILE_SET HEADERS
)
