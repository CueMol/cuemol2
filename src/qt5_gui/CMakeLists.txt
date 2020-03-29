include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

# Find includes in the build directories
set(CMAKE_INCLUDE_CURRENT_DIR ON)

# Turn on automatic invocation of the MOC, UIC & RCC
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)

# Find the QtWidgets library
find_package(Qt5 REQUIRED COMPONENTS Core Widgets OpenGL)
message(STATUS "Qt5Widgets_FOUND: ${Qt5Widgets_FOUND}")

# Make this a GUI application on Windows
if(WIN32)
  set(CMAKE_WIN32_EXECUTABLE ON)
endif()

# Default config path
file(TO_NATIVE_PATH "${CMAKE_INSTALL_PREFIX}/data/sysconfig.xml" DEFAULT_SYSCONFIG_PATH)
STRING(REPLACE "\\" "\\\\" DEFAULT_SYSCONFIG_PATH ${DEFAULT_SYSCONFIG_PATH})
message("DEFAULT_SYSCONFIG_PATH: ${DEFAULT_SYSCONFIG_PATH}")
add_definitions(-DDEFAULT_CONFIG=\"${DEFAULT_SYSCONFIG_PATH}\")

SET(QT5GUI_SRCS
  main.cpp
  mainwindow.cpp
  qt5_gui.cpp
  QtGlDisplayContext.cpp
  QtGlView.cpp
  QtMolWidget.cpp
  QtTimerImpl.cpp
  QtScenePanel.cpp
  QtMolStructPanel.cpp
  )

SET(QT5GUI_LINK_LIBRARIES
  pcre
  expat
  qmpng
  qmzlib
  qlib
  gfx
  qsys
  sysdep
  molstr
  molvis
  surface
  molanl
  symm
  xtal
  lwview
  render
  anim
  mdtools
  importers
  Boost::filesystem
  CGAL::CGAL
  Qt5::Widgets
  Qt5::OpenGL
  )

add_executable(cuemol2 ${QT5GUI_SRCS})

# Add the Qt5 Widgets for linking
target_link_libraries(cuemol2 ${QT5GUI_LINK_LIBRARIES})

install(TARGETS cuemol2
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
  )

# For VS Debug
set_target_properties(cuemol2 PROPERTIES
  VS_DEBUGGER_ENVIRONMENT "PATH=${BOOST_LIBRARYDIR};${CMAKE_PREFIX_PATH}/bin;%PATH%")
