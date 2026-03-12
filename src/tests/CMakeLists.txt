include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.14.0
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(test_qlib qlib/test_vector4d.cpp)
target_include_directories(test_qlib PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_qlib PRIVATE qlib GTest::gtest_main)
include(GoogleTest)
gtest_discover_tests(test_qlib)

add_executable(test_gfx gfx/test_solid_color.cpp)
target_include_directories(test_gfx PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_gfx PRIVATE gfx qlib GTest::gtest)
gtest_discover_tests(test_gfx)

add_executable(test_qsys
  qsys/test_main.cpp
  qsys/test_camera.cpp
  qsys/test_drawobj.cpp
  qsys/test_dispcache.cpp
  qsys/test_editinfo.cpp
  qsys/test_sysconfig.cpp
  qsys/test_undomanager.cpp
  qsys/test_multigradient.cpp
  qsys/test_propeditinfo.cpp
  qsys/test_viewinputconfig.cpp
  qsys/test_indevevent.cpp
  qsys/test_objectevent.cpp
  qsys/test_rendererevent.cpp
  qsys/test_sceneevent.cpp
  qsys/test_viewevent.cpp
  qsys/test_inouthandler.cpp
  qsys/test_objloadinfo.cpp
  qsys/test_rendgroup.cpp
  qsys/test_renderer.cpp
  qsys/test_object.cpp
  qsys/test_qdfstream.cpp
  qsys/test_rendererfactory.cpp
  qsys/test_scenemanager.cpp
  qsys/test_scene.cpp
  qsys/test_streammanager.cpp
  qsys/test_objreader.cpp
  qsys/test_objwriter.cpp
  qsys/test_sceneexporter.cpp
  qsys/test_view.cpp
  qsys/test_screventmanager.cpp
)
target_include_directories(test_qsys PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_qsys PRIVATE qsys gfx qlib Boost::filesystem Boost::thread GTest::gtest)
gtest_discover_tests(test_qsys)
