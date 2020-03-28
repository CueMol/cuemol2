# Find includes in the build directories
set(CMAKE_INCLUDE_CURRENT_DIR ON)

# Turn on automatic invocation of the MOC, UIC & RCC
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)
set(CMAKE_AUTORCC ON)

# Find the QtWidgets library
find_package(Qt5 REQUIRED COMPONENTS Widgets)
message(STATUS "Qt5Widgets_FOUND: ${Qt5Widgets_FOUND}")

# Make this a GUI application on Windows
if(WIN32)
  set(CMAKE_WIN32_EXECUTABLE ON)
endif()

# Tell CMake to create the helloworld executable
add_executable(cuemol2 main.cpp mainwindow.cpp)

# Add the Qt5 Widgets for linking
target_link_libraries(cuemol2 Qt5::Widgets)
