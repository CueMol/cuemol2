// -*-Mode: C++;-*-
//
// Unicode support
//
// $Id: LUnicode.hpp,v 1.4 2009/08/08 17:42:26 rishitani Exp $

#ifndef L_UNICODE_HPP__
#define L_UNICODE_HPP__

#include "qlib.hpp"
#include "LString.hpp"
using qlib::LString;

namespace qlib {

  /////////////////////
  // UNICODE support //

  /** convert one char UTF8 (mbcs) to UCS16 (wcs) */
  QLIB_API U16Char UTF8toUCS16(const LString &utf8, int &index);

  /** check the string is ascii or not */
  QLIB_API bool isASCII(const LString &str);

  //void UTF8toUCS16(const LString &utf8, std::vector<unsigned short> &vec);

  /** convert UTF8 (mbcs) string to UCS16 (wcs) wchar_t array */
  QLIB_API U16Char *UTF8toUCS16(const LString &utf8, int *pucs16len=NULL);

  /** convert UCS16 (wcs) to UTF8 (mbcs) */
  QLIB_API void UCS16toUTF8(const U16Char *ucs16, int nwclen, LString &utf8);

  /** convert native mbcs (e.g. ShiftJIS) to UTF-8 */
  QLIB_API LString nativeToUTF8(const char *psnat);

  /** convert UTF-8 to native mbcs (e.g. ShiftJIS) */
  QLIB_API char *UTF8toNative(const LString &utf8);

  /** open file with UTF-8 */
  QLIB_API FILE *fopen_utf8(const LString &utf8name, const LString &utf8mode);

}

#endif

