include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.14.0
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Use PRE_TEST discovery on all platforms.
#
# The default POST_BUILD mode runs each test executable at build time to
# enumerate its cases, which is fragile in two ways: on Windows the module DLLs
# are not yet locatable (no rpath), and on macOS/Linux the enumeration output is
# intermittently truncated, making CMake's ParseTestList fail with "value,
# object or array expected" and breaking the build non-deterministically (a
# known gtest_discover_tests / string(JSON) flakiness). PRE_TEST defers
# enumeration to ctest time, where the DLL directories are placed on PATH (see
# the "Run gtest" step in .github/workflows/build2.yml), so a plain build never
# runs the test exes and cannot flake.
set(CMAKE_GTEST_DISCOVER_TESTS_DISCOVERY_MODE PRE_TEST)

add_executable(test_qlib
  qlib/test_main.cpp
  qlib/test_vector4d.cpp
  qlib/test_matrix4d.cpp
  qlib/test_lquat.cpp
  qlib/test_lstring.cpp
  qlib/test_rangeset.cpp
  qlib/test_lscrtime.cpp
  qlib/test_lregexpr.cpp
  qlib/test_msglog.cpp
  qlib/test_lscrmatrix4d.cpp
  qlib/test_ldom2node.cpp
  qlib/test_ldom2stream.cpp
  qlib/test_pipestream.cpp
  qlib/test_lthread.cpp
  qlib/test_binstream.cpp
  qlib/test_eventmanager.cpp
  qlib/test_lprocmgr.cpp
  qlib/test_limited_in_stream.cpp
  qlib/test_line_stream.cpp
  qlib/test_parallel.cpp
  qlib/test_chunked_array3d.cpp
  qlib/test_seekable_stream.cpp
)
target_include_directories(test_qlib PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_qlib PRIVATE qlib GTest::gtest)
include(GoogleTest)
gtest_discover_tests(test_qlib PROPERTIES LABELS "test_qlib")

add_executable(test_gfx
  gfx/test_solid_color.cpp
  gfx/test_gpuprim.cpp
  gfx/test_aoconstants.cpp
)
target_include_directories(test_gfx PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_gfx PRIVATE gfx qlib GTest::gtest)
gtest_discover_tests(test_gfx PROPERTIES LABELS "test_gfx")

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
  qsys/test_stream_manager_search.cpp
  qsys/test_stream_manager_sniff_escalation.cpp
  qsys/test_objreader.cpp
  qsys/test_objwriter.cpp
  qsys/test_sceneexporter.cpp
  qsys/test_view.cpp
  qsys/test_screventmanager.cpp
  qsys/test_displistrenderer.cpp
  qsys/test_qdfabsreader.cpp
  qsys/test_qdfabswriter.cpp
  qsys/test_scalarobject.cpp
  qsys/test_scenexmlreader.cpp
  qsys/test_scenexmlwriter.cpp
  qsys/test_canvas2dtextrender2.cpp
  qsys/test_guiview.cpp
  qsys/test_shaderobjmgr.cpp
  qsys/test_animmgr.cpp
)
target_include_directories(test_qsys PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_qsys PRIVATE qsys gfx qlib Boost::filesystem GTest::gtest)
gtest_discover_tests(test_qsys PROPERTIES LABELS "test_qsys")

add_executable(test_molstr
  modules/molstr/test_main.cpp
  modules/molstr/test_molatom.cpp
  modules/molstr/test_molresidue.cpp
  modules/molstr/test_molchain.cpp
  modules/molstr/test_molbond.cpp
  modules/molstr/test_selcommand.cpp
  modules/molstr/test_simplerenderer.cpp
  modules/molstr/test_tracerenderer.cpp
)
target_include_directories(test_molstr PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_link_libraries(test_molstr PRIVATE molstr qsys gfx qlib Boost::filesystem GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_molstr PRIVATE sysdep)
endif()
gtest_discover_tests(test_molstr PROPERTIES LABELS "test_molstr")

add_executable(test_molvis
  modules/molvis/test_main.cpp
  modules/molvis/test_cpk2renderer.cpp
  modules/molvis/test_smoothspline.cpp
)
target_include_directories(test_molvis PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_compile_definitions(test_molvis PRIVATE
  CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
)
target_link_libraries(test_molvis PRIVATE molvis molstr qsys gfx qlib Boost::filesystem GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_molvis PRIVATE sysdep)
endif()
gtest_discover_tests(test_molvis PROPERTIES LABELS "test_molvis")

add_executable(test_surface
  modules/surface/test_main.cpp
  modules/surface/test_distfield_surf.cpp
  modules/surface/test_ply_reader.cpp
  modules/surface/test_molsurf_serialize.cpp
  modules/surface/test_ses_from_array.cpp
)
target_include_directories(test_surface PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_compile_definitions(test_surface PRIVATE
  CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
)
target_link_libraries(test_surface PRIVATE surface symm xtal molstr qsys gfx qlib Boost::filesystem GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_surface PRIVATE sysdep)
endif()
gtest_discover_tests(test_surface PROPERTIES LABELS "test_surface")

add_executable(test_xtal
  modules/xtal/test_main.cpp
  modules/xtal/test_atomposmap2.cpp
  modules/xtal/test_ccp4_origin.cpp
  modules/xtal/test_ccp4map_stream.cpp
  modules/xtal/test_map_block_extract.cpp
  modules/xtal/test_map_histogram.cpp
  modules/xtal/test_mapkind_detect.cpp
  modules/xtal/test_maplod.cpp
  modules/xtal/test_mapmesh_full.cpp
  modules/xtal/test_mapmesh_viewregion.cpp
  modules/xtal/test_maprenderer_color.cpp
  modules/xtal/test_maprenderer_region.cpp
  modules/xtal/test_mapsurf_molfanc.cpp
  modules/xtal/test_mapsurf_pin.cpp
  modules/xtal/test_mapsurf_viewregion.cpp
  modules/xtal/test_multigrad_undo.cpp
  modules/xtal/test_qdfmap_roundtrip.cpp
  modules/xtal/test_quant_step.cpp
)
target_include_directories(test_xtal PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_compile_definitions(test_xtal PRIVATE
  CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
)
target_link_libraries(test_xtal PRIVATE surface symm xtal molstr qsys gfx qlib Boost::filesystem GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_xtal PRIVATE sysdep)
endif()
gtest_discover_tests(test_xtal PROPERTIES LABELS "test_xtal")

# Run the MC pinning tests again in a separate process with oneTBB forced
# serial (the CUEMOL_TBB_THREADS cap is latched once per process), so both
# the default-parallel and forced-serial paths are checked against the same
# golden values.
add_test(NAME test_xtal_mc_serial
  COMMAND test_xtal --gtest_filter=MapSurfPin.*)
set_tests_properties(test_xtal_mc_serial PROPERTIES
  ENVIRONMENT "CUEMOL_TBB_THREADS=1" LABELS "test_xtal")

add_executable(test_importers
  modules/importers/test_main.cpp
  modules/importers/test_sdfmolreader.cpp
  modules/importers/test_mmcifmolreader.cpp
  modules/importers/test_mmcif_sniff.cpp
  modules/importers/test_ccp4map_sniff.cpp
  modules/importers/test_xplormap_sniff.cpp
  modules/importers/test_pdb_sniff.cpp
  modules/importers/test_sdf_sniff.cpp
  modules/importers/test_mol2_sniff.cpp
  modules/importers/test_brix_sniff.cpp
  modules/importers/test_mtz_sniff.cpp
  modules/importers/test_opendx_sniff.cpp
  modules/importers/test_msms_sniff.cpp
  modules/importers/test_namdcoor_sniff.cpp
  modules/importers/test_gro_sniff.cpp
  modules/importers/test_grofilereader.cpp
  modules/importers/test_amber_sniff.cpp
  modules/importers/test_amber_reader.cpp
  modules/importers/test_load_object_command_guess.cpp
  modules/importers/test_trajio.cpp
)
target_include_directories(test_importers PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_compile_definitions(test_importers PRIVATE
  CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
)
target_link_libraries(test_importers PRIVATE importers surface symm xtal mdtools molvis molstr qsys gfx qlib Boost::filesystem GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_importers PRIVATE sysdep)
endif()
gtest_discover_tests(test_importers PROPERTIES LABELS "test_importers")

add_executable(test_molanl
  modules/molanl/test_main.cpp
  modules/molanl/test_ssm_superpose.cpp
)
target_include_directories(test_molanl PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/modules
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
)
target_compile_definitions(test_molanl PRIVATE
  CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
  CUEMOL2_TEST_DATA_DIR="${CMAKE_SOURCE_DIR}/tests/test_data"
)
target_link_libraries(test_molanl PRIVATE molanl molstr qsys gfx qlib GTest::gtest)
if (BUILD_OPENGL_SYSDEP)
  target_link_libraries(test_molanl PRIVATE sysdep)
endif()
gtest_discover_tests(test_molanl PROPERTIES LABELS "test_molanl")

# umbreon (Embree) backend integration. Only built when ENABLE_UMBREON is on;
# exercises the render module's umbreon DisplayContext / SceneExporter, which
# pull in umbreon + the bundled Embree/TBB.
if (ENABLE_UMBREON)
  add_executable(test_umbreon
    modules/rendering/test_umbreon_main.cpp
    modules/rendering/test_umbreon_export.cpp
  )
  target_include_directories(test_umbreon PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/src/modules
    ${CMAKE_BINARY_DIR}/src
    ${Boost_INCLUDE_DIRS}
  )
  target_compile_definitions(test_umbreon PRIVATE
    CUEMOL2_SYSCONFIG_PATH="${CMAKE_SOURCE_DIR}/data/sysconfig.xml"
  )
  target_link_libraries(test_umbreon PRIVATE render qsys gfx qlib Boost::filesystem GTest::gtest)
  gtest_discover_tests(test_umbreon PROPERTIES LABELS "test_umbreon")
endif()
