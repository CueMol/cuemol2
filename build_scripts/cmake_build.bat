SET GLEW_ROOT=d:\proj64_cmake

cmake .. -DCMAKE_PREFIX_PATH=d:\proj64_cmake -DLibLZMA_ROOT=d:\proj64_cmake -DBUILD_GUI=ON -DBUILD_PYTHON_BINDINGS=ON -DCMAKE_INSTALL_PREFIX=d:\proj64_cmake\tmp -DBOOST_ROOT=d:\proj64_cmake\boost\boost_1_72_0 -DBOOST_LIBRARYDIR=d:\proj64_cmake\boost\boost_1_72_0\lib64-msvc-14.2 -DCGAL_ROOT=d:\proj64_cmake\CGAL-4.14.3 -DCGAL_DISABLE_GMP=ON

