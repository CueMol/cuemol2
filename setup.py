import shutil
import glob
import os
import re
import sys
import platform
import subprocess
from pathlib import Path

from setuptools import find_packages
from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
from distutils.version import LooseVersion
import distutils.dir_util
import distutils.file_util


def copy_generated_pyfiles(src_dir, build_dir, dest_dir):
    print(f"src_dir {src_dir}")
    print(f"build_dir {build_dir}")
    print(f"dest_dir {dest_dir}")
    distutils.dir_util.copy_tree(str(src_dir / "src" / "pybr" / "scripts"), str(dest_dir))
    for py_file in glob.glob(str(build_dir / "**" / "*.py"), recursive=True):
        distutils.file_util.copy_file(py_file, str(dest_dir / "wrappers"))

    distutils.dir_util.copy_tree(str(src_dir / "src" / "xul_gui" / "data"), str(dest_dir / "config" / "data"))
    distutils.file_util.copy_file(str(src_dir / "src" / "xul_gui" / "sysconfig.xml"), str(dest_dir / "config"))


class CMakeExtension(Extension):
    def __init__(self, name, sourcedir=''):
        Extension.__init__(self, name, sources=[])
        self.sourcedir = os.path.abspath(sourcedir)


class CMakeBuild(build_ext):
    def run(self):
        try:
            out = subprocess.check_output(['cmake', '--version'])
        except OSError:
            raise RuntimeError("CMake must be installed to build the following extensions: " +
                               ", ".join(e.name for e in self.extensions))

        if platform.system() == "Windows":
            cmake_version = LooseVersion(re.search(r'version\s*([\d.]+)', out.decode()).group(1))
            if cmake_version < '3.1.0':
                raise RuntimeError("CMake >= 3.1.0 is required on Windows")

        for ext in self.extensions:
            self.build_extension(ext)

    def build_extension(self, ext):
        extdir = os.path.abspath(os.path.dirname(self.get_ext_fullpath(ext.name)))
        # required for auto-detection of auxiliary "native" libs
        if not extdir.endswith(os.path.sep):
            extdir += os.path.sep

        env = os.environ.copy()
        prefix_path = env.get("CMAKE_PREFIX_PATH", None)
        build_min = env.get("BUILD_MINIMUM_MODULES", "OFF")
        cmake_args = ['-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=' + extdir,]
        # XXX: PYTHON_EXECUTABLE has no effect in the recent version of CMake
        # '-DPYTHON_EXECUTABLE=' + sys.executable]
        python_exec_path = Path(sys.executable)
        python_root_dir = python_exec_path.parent.parent
        print(f"sys.executable: {sys.executable}")
        print(f"python_root_dir: {python_root_dir}")

        cmake_args += [
            "-DBUILD_GUI=OFF",
            "-DBUILD_PYTHON_BINDINGS=ON",
            "-DBUILD_PYTHON_MODULE=ON",
            f"-DBUILD_MINIMUM_MODULES={build_min}",
            f"-DPython3_ROOT_DIR={python_root_dir}",
        ]
        if prefix_path:
            cmake_args.append(f"-DCMAKE_PREFIX_PATH={prefix_path}")
            cmake_args.append(f"-DFFTW_ROOT={prefix_path}/fftw")

        print(f"******** cmake_args: {cmake_args}", flush=True)
        cfg = 'Debug' if self.debug else 'Release'
        build_args = ['--config', cfg]

        if platform.system() == "Windows":
            cmake_args += ['-DCMAKE_LIBRARY_OUTPUT_DIRECTORY_{}={}'.format(cfg.upper(), extdir)]
            if sys.maxsize > 2**32:
                cmake_args += ['-A', 'x64']
            build_args += ['--', '/m']
        else:
            cmake_args += ['-DCMAKE_BUILD_TYPE=' + cfg]

        env['CXXFLAGS'] = '{} -DVERSION_INFO=\\"{}\\"'.format(env.get('CXXFLAGS', ''),
                                                              self.distribution.get_version())
        if not os.path.exists(self.build_temp):
            os.makedirs(self.build_temp)
        subprocess.check_call(['cmake', ext.sourcedir] + cmake_args, cwd=self.build_temp, env=env)
        subprocess.check_call(['cmake', '--build', '.'] + build_args, cwd=self.build_temp)

        copy_generated_pyfiles(Path(ext.sourcedir), Path(self.build_temp), Path(extdir))

setup(
    name='cuemol',
    version='0.0.1',
    author='Ryuichiro Ishitani',
    author_email='ishitani@users.sourceforge.net',
    description='CueMol: Molecular Visualization Framework',
    long_description='',
    ext_modules=[CMakeExtension('cuemol._cuemol_internal')],
    cmdclass=dict(build_ext=CMakeBuild),
    zip_safe=False,
    # packages=["cuemol"],
    # package_dir={"": "dist/data/python/",
    #              "cuemol": "dist/data/python/cuemol"},
)
