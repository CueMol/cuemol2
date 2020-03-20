
include(CheckTypeSize)
CHECK_TYPE_SIZE("char" SIZEOF_CHAR LANGUAGE CXX)
CHECK_TYPE_SIZE("short" SIZEOF_SHORT LANGUAGE CXX)
CHECK_TYPE_SIZE("int" SIZEOF_INT LANGUAGE CXX)
CHECK_TYPE_SIZE("long" SIZEOF_LONG LANGUAGE CXX)
CHECK_TYPE_SIZE("long long" SIZEOF_LONG_LONG LANGUAGE CXX)
CHECK_TYPE_SIZE("float" SIZEOF_FLOAT LANGUAGE CXX)
CHECK_TYPE_SIZE("double" SIZEOF_DOUBLE LANGUAGE CXX)
CHECK_TYPE_SIZE("void*" SIZEOF_VOIDP LANGUAGE CXX)

include(TestBigEndian)
TEST_BIG_ENDIAN(IS_HOST_BIG_ENDIAN)
message(STATUS "IS_HOST_BIG_ENDIAN ${IS_HOST_BIG_ENDIAN}")

include(CheckIncludeFileCXX)
CHECK_INCLUDE_FILE_CXX("stdarg.h" HAVE_STDARG_H)
CHECK_INCLUDE_FILE_CXX("unistd.h" HAVE_UNISTD_H)
CHECK_INCLUDE_FILE_CXX("locale.h" HAVE_LOCALE_H)
CHECK_INCLUDE_FILE_CXX("xlocale.h" HAVE_XLOCALE_H)
CHECK_INCLUDE_FILE_CXX("spawn.h" HAVE_SPAWN_H)
CHECK_INCLUDE_FILE_CXX("sys/wait.h" HAVE_SYS_WAIT_H)

if (${IS_HOST_BIG_ENDIAN})
  SET(BYTEORDER "4321")
else (${IS_HOST_BIG_ENDIAN})
  SET(BYTEORDER "1234")
endif (${IS_HOST_BIG_ENDIAN})

if (${Boost_FOUND})
  SET(HAVE_BOOST "1")
endif (${Boost_FOUND})

if (${Boost_CHRONO_FOUND})
  SET(HAVE_BOOST_CHRONO "1")
endif (${Boost_CHRONO_FOUND})

if (${Boost_FILESYSTEM_FOUND})
  SET(HAVE_BOOST_FILESYSTEM "1")
endif (${Boost_FILESYSTEM_FOUND})

if (${Boost_SYSTEM_FOUND})
  SET(HAVE_BOOST_SYSTEM "1")
endif (${Boost_SYSTEM_FOUND})

if (${Boost_THREAD_FOUND})
  SET(HAVE_BOOST_THREAD "1")
endif (${Boost_THREAD_FOUND})

if (${Boost_TIMER_FOUND})
  SET(HAVE_BOOST_TIMER "1")
endif (${Boost_TIMER_FOUND})

#####

if (${HAVE_STDARG_H})
  SET(define_HAVE_STDARG_H "define")
else (${HAVE_STDARG_H})
  SET(define_HAVE_STDARG_H "undef")
endif (${HAVE_STDARG_H})

if (${HAVE_UNISTD_H})
  SET(define_HAVE_UNISTD_H "define")
else (${HAVE_UNISTD_H})
  SET(define_HAVE_UNISTD_H "undef")
endif (${HAVE_UNISTD_H})

if (${HAVE_LOCALE_H})
  SET(define_HAVE_LOCALE_H "define")
else (${HAVE_LOCALE_H})
  SET(define_HAVE_LOCALE_H "undef")
endif (${HAVE_LOCALE_H})

if (${HAVE_XLOCALE_H})
  SET(define_HAVE_XLOCALE_H "define")
else (${HAVE_XLOCALE_H})
  SET(define_HAVE_XLOCALE_H "undef")
endif (${HAVE_XLOCALE_H})

if (${HAVE_SPAWN_H})
  SET(define_HAVE_SPAWN_H "define")
else (${HAVE_SPAWN_H})
  SET(define_HAVE_SPAWN_H "undef")
endif (${HAVE_SPAWN_H})

if (${HAVE_SYS_WAIT_H})
  SET(define_HAVE_SYS_WAIT_H "define")
else (${HAVE_SYS_WAIT_H})
  SET(define_HAVE_SYS_WAIT_H "undef")
endif (${HAVE_SYS_WAIT_H})

#####

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/config_cmake.h.in
  ${CMAKE_CURRENT_BINARY_DIR}/config.h
  @ONLY)
add_definitions(-DHAVE_CONFIG_H=1)

##########

add_subdirectory(qlib)
