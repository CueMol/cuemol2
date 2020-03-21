
#ifndef __QM_TYPES_H_INCLUDED__
#define __QM_TYPES_H_INCLUDED__

///////////////////////////////
// INT_8
#if (SIZEOF_CHAR!=1)
#  error "System with sizeof(char)!=1 is not supported."
#endif

#define QUE_INT_8 char
#define QUE_UINT_8 unsigned char
#define QUE_BYTE unsigned char

///////////////////////////////
// INT_16
#if (SIZEOF_SHORT==2)
#  define QUE_INT_16 short
#  define QUE_UINT_16 unsigned short
#elif (SIZEOF_INT==2)
#  define QUE_INT_16 int
#  define QUE_UINT_16 unsigned int
#elif (SIZEOF_LONG==2)
#  define QUE_INT_16 long
#  define QUE_UINT_16 unsigned long
#elif (SIZEOF_LONG_LONG==2)
#  define QUE_INT_16 long long
#  define QUE_UINT_16 unsigned long long
#else
#  error "System with sizeof(XXX)==2 is not found."
#endif

///////////////////////////////
// INT_32
#if (SIZEOF_SHORT==4)
#  define QUE_INT_32 short
#  define QUE_UINT_32 unsigned short
#elif (SIZEOF_INT==4)
#  define QUE_INT_32 int
#  define QUE_UINT_32 unsigned int
#elif (SIZEOF_LONG==4)
#  define QUE_INT_32 long
#  define QUE_UINT_32 unsigned long
#elif (SIZEOF_LONG_LONG==4)
#  define QUE_INT_32 long long
#  define QUE_UINT_32 unsigned long long
#else
#  error "System with sizeof(XXX)==4 is not found."
#endif

///////////////////////////////
// INT_64
#if (SIZEOF_SHORT==8)
#  define QUE_INT_64 short
#  define QUE_UINT_64 unsigned short
#elif (SIZEOF_INT==8)
#  define QUE_INT_64 int
#  define QUE_UINT_64 unsigned int
#elif (SIZEOF_LONG==8)
#  define QUE_INT_64 long
#  define QUE_UINT_64 unsigned long
#elif (SIZEOF_LONG_LONG==8)
#  define QUE_INT_64 long long
#  define QUE_UINT_64 unsigned long long
#else
#  error "System with sizeof(XXX)==8 is not found."
#endif

#if (SIZEOF_VOIDP==1)
// 8bit arch
#  define QUE_VOIDP QUE_UINT_8
#elif (SIZEOF_VOIDP==2)
// 16bit arch
#  define QUE_VOIDP QUE_UINT_16
#elif (SIZEOF_VOIDP==4)
// 32bit arch
#  define QUE_VOIDP QUE_UINT_32
#elif (SIZEOF_VOIDP==8)
// 64bit arch
#  define QUE_VOIDP QUE_UINT_64
#else
#  error "System with sizeof(voidp)>8 is not found."
#endif



// FLT_32
#if (SIZEOF_FLOAT!=4)
#  error "System with sizeof(float)!=4 is not supported."
#endif
#define QUE_FLT_32 float

// FLT_64
#if (SIZEOF_DOUBLE!=8)
#  error "System with sizeof(double)!=8 is not supported."
#endif
#define QUE_FLT_64 double

#ifdef HAVE_WCHAR_T_16BIT
typedef wchar_t U16Char;
#else
typedef QUE_UINT_16 U16Char;
#endif

#endif
