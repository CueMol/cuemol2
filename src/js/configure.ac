# Process this file with autoconf to produce a configure script.

AC_INIT(SpiderMonkey, 1.6, ishitani_at_users.sourceforge.net)
AC_CONFIG_AUX_DIR(..)
AM_INIT_AUTOMAKE(1.9)
AM_CONFIG_HEADER([config.h])
AC_CANONICAL_HOST

AC_PROG_CC
AC_PROG_RANLIB
AC_EXEEXT

echo "host_os: $host_os"
echo "target_os: $target_os"

###########################

dnl **********************
dnl *** va_copy checks ***
dnl **********************
dnl we currently check for all three va_copy possibilities, so we get
dnl all results in config.log for bug reports.

AC_MSG_CHECKING(for an implementation of va_copy())
AC_CACHE_VAL(ac_cv_va_copy,[
    AC_TRY_RUN([
        #include <stdarg.h>
        void f (int i, ...) {
            va_list args1, args2;
            va_start (args1, i);
            va_copy (args2, args1);
            if (va_arg (args2, int) != 42 || va_arg (args1, int) != 42)
                exit (1);
            va_end (args1); va_end (args2);
        }
        int main() { f (0, 42); return 0; }],
        ac_cv_va_copy=yes,
        ac_cv_va_copy=no,
        ac_cv_va_copy=no
    )
])
AC_MSG_RESULT($ac_cv_va_copy)
AC_MSG_CHECKING(for an implementation of __va_copy())
AC_CACHE_VAL(ac_cv___va_copy,[
    AC_TRY_RUN([
        #include <stdarg.h>
        void f (int i, ...) {
            va_list args1, args2;
            va_start (args1, i);
            __va_copy (args2, args1);
            if (va_arg (args2, int) != 42 || va_arg (args1, int) != 42)
                exit (1);
            va_end (args1); va_end (args2);
        }
        int main() { f (0, 42); return 0; }],
        ac_cv___va_copy=yes,
        ac_cv___va_copy=no,
        ac_cv___va_copy=no
    )
])
AC_MSG_RESULT($ac_cv___va_copy)
AC_MSG_CHECKING(whether va_lists can be copied by value)
AC_CACHE_VAL(ac_cv_va_val_copy,[
    AC_TRY_RUN([
        #include <stdarg.h>
        void f (int i, ...) {
            va_list args1, args2;
            va_start (args1, i);
            args2 = args1;
            if (va_arg (args2, int) != 42 || va_arg (args1, int) != 42)
                exit (1);
            va_end (args1); va_end (args2);
        }
        int main() { f (0, 42); return 0; }],
        ac_cv_va_val_copy=yes,
        ac_cv_va_val_copy=no,
        ac_cv_va_val_copy=yes
    )
])

if test "x$ac_cv_va_copy" = "xyes"; then
    AC_DEFINE(VA_COPY, [va_copy], [va_copy])
    AC_DEFINE(HAVE_VA_COPY,[HAVE_VA_COPY],[HAVE_VA_COPY])
elif test "x$ac_cv___va_copy" = "xyes"; then
    AC_DEFINE(VA_COPY, [__va_copy], [__va_copy])
    AC_DEFINE(HAVE_VA_COPY,[HAVE_VA_COPY],[HAVE_VA_COPY])
fi

if test "x$ac_cv_va_val_copy" = "xno"; then
   AC_DEFINE(HAVE_VA_LIST_AS_ARRAY, [HAVE_VA_LIST_AS_ARRAY], [HAVE_VA_LIST_AS_ARRAY])
fi

AC_MSG_RESULT($ac_cv_va_val_copy)

###########################
# check for OS-dependent config 
# TO DO: handling for x86_64 arch in linux

echo "host_os: $host_os"

case $host_os in
     darwin*)
dnl	CFLAGS="$CFLAGS -m32"
dnl	CXXFLAGS="$CXXFLAGS -m32"
     ;;
     *)
     ;;
esac

echo "CFLAGS: $CFLAGS"

###########################

CPPFLAGS="-DXP_UNIX $CPPFLAGS"
LIBS="$LIBS -lm"

AC_OUTPUT(Makefile)
