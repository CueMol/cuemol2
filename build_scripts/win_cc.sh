# Windows (Git Bash) compiler selection shared by the CMake build scripts.
# Source it after detecting Windows; it sets WIN_CC_OPT for the cmake command.
#
#   CUEMOL_WIN_CC=clang-cl (default) -- clang-cl + lld-link
#   CUEMOL_WIN_CC=cl                 -- MSVC cl (the pre-clang toolchain)
#
# Both need an x64 MSVC dev environment (vcvars): clang-cl uses the MSVC STL,
# CRT and Windows SDK from it, and shares the MSVC C++ ABI, so the MSVC-built
# deplibs (/MD) link unchanged; the vc143-tagged Boost libs are selected
# explicitly. The dynamic CRT is pinned to /MD to match them.
# Keep in sync with win_cc.bat.

#
# WIN_CC_COMPILER_OPT holds the compiler choice alone (for cmake-js, which sets
# its own CRT); WIN_CC_OPT adds the /MD CRT.

if [ "${CUEMOL_WIN_CC:-clang-cl}" = "cl" ]; then
    WIN_CC_COMPILER_OPT="-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl"
elif [ "${CUEMOL_WIN_CC:-clang-cl}" = "clang-cl" ]; then
    # The vcvars env does not put LLVM on PATH; fall back to the default install
    if ! command -v clang-cl >/dev/null && [ -x "/c/Program Files/LLVM/bin/clang-cl.exe" ]; then
        export PATH="/c/Program Files/LLVM/bin:$PATH"
    fi
    WIN_CC_COMPILER_OPT="-DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl -DCMAKE_LINKER=lld-link -DBoost_COMPILER=vc143"
else
    echo "Unknown CUEMOL_WIN_CC: ${CUEMOL_WIN_CC} (expected clang-cl or cl)" >&2
    exit 1
fi
WIN_CC_OPT="$WIN_CC_COMPILER_OPT -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL"
