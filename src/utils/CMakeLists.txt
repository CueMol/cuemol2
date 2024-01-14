
add_executable(blendpng blendpng.cpp)
target_include_directories(
  blendpng PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${LCMS2_INCLUDE_DIR}
)  
# target_link_directories(
#   blendpng PRIVATE
# )
target_link_libraries(
  blendpng PRIVATE
  qmpng qmzlib
  ${LCMS2_LIBRARIES}
)
install(TARGETS blendpng
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
