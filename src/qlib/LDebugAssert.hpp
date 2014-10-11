// -*-Mode: C++;-*-
//
// LDebugAssert.hpp
// Debug Assertion macro
//

#ifndef QLIB_DEBUG_ASSERT_HPP
#define QLIB_DEBUG_ASSERT_HPP

// MB_ASSERT
#ifndef MB_ASSERT
# ifdef MB_DEBUG
#  include <assert.h>
#  define MB_ASSERT(e) assert(e)
# else
#  define MB_ASSERT(expr) (void)0
# endif
#endif

#endif
