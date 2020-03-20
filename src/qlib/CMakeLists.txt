include_directories(
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_BINARY_DIR}/src
  ${Boost_INCLUDE_DIRS}
  )

SET(QLIB_SRCS
NamedObject.cpp
LMsgLog.cpp
ClassRegistry.cpp
LClass.cpp
LRcObject.cpp
LVariant.cpp
LPropSupport.cpp
LPropContainer.cpp
LScrObjects.cpp
LScrSmartPtr.cpp
LChar.cpp
LString.cpp
LUnicode.cpp
LThread.cpp
ObjectManager.cpp
Utils.cpp
ArrayIOImpl.cpp
PosixFileStream.cpp
PrintStream.cpp
LineStream.cpp
BinStream.cpp
StringStream.cpp
XmlInStream.cpp
ExpatInStream.cpp
GzipStream.cpp
Base64Stream.cpp
PipeStream.cpp
VectorHelper.cpp
MatrixHelper.cpp
LRegExpr.cpp
LLogEvent.cpp
EventManager.cpp
LDOM2Stream.cpp
LDOM2Tree.cpp
LScrVector4D.cpp
LScrMatrix4D.cpp
LScrQuat.cpp
LScrTime.cpp
LScrRangeSet.cpp
LWrapper.cpp
LDataSrcContainer.cpp
LObjStream3.cpp
LProcMgr.cpp
LPerfMeas.cpp
qlib.cpp
)

# CueMol interface definitions for MCWRAPGEN
SET(QLIB_MCWG_SRCS
Matrix.qif
Vector.qif
RegExpr.qif
Quat.qif
RangeSet.qif
TimeValue.qif
MsgLog.qif
LScrCallBack.qif
ByteArray.qif
ProcessManager.qif)

# SET(MCWRAPGEN "perl ${CMAKE_SOURCE_DIR}/src/perl/mcwrapgen3.pl")
SET(MCWG_INCLUDES "-D HAVE_CONFIG_H -I ${CMAKE_SOURCE_DIR}/src -I ${CMAKE_CURRENT_SOURCE_DIR}")
# SET(MCWG_SRC_CMD "${MCWRAPGEN} ${MCWG_INCLUDES} -m src")
foreach(_file ${QLIB_MCWG_SRCS})
  SET(_file "${CMAKE_CURRENT_SOURCE_DIR}/${_file}")

  get_filename_component(_file_stem ${_file} NAME_WE)
  SET(_out_cpp_file "${CMAKE_CURRENT_SOURCE_DIR}/${_file_stem}_wrap.cpp")
  SET(_out_hpp_file "${CMAKE_CURRENT_SOURCE_DIR}/${_file_stem}_wrap.hpp")
  message(STATUS "MCWG file ${_file}")
  message(STATUS "MCWG file output ${_out_cpp_file}")
  message(STATUS "MCWG file output ${_out_hpp_file}")

  add_custom_command(
    OUTPUT ${_out_cpp_file}
    COMMAND perl ${CMAKE_SOURCE_DIR}/src/perl/mcwrapgen3.pl -m src ${_file}
    )
  add_custom_command(
    OUTPUT ${_out_hpp_file}
    COMMAND perl ${CMAKE_SOURCE_DIR}/src/perl/mcwrapgen3.pl -m hdr ${_file}
    )
  list(APPEND QLIB_SRCS ${_out_cpp_file})
  list(APPEND MCWG_HEADERS ${_out_hpp_file})
endforeach()

add_custom_target(generate_headers DEPENDS ${MCWG_HEADERS})

message(STATUS "src file ${QLIB_SRCS}")
add_library(qlib SHARED ${QLIB_SRCS})
target_link_libraries(qlib PRIVATE pcre expat qmzlib Boost::filesystem Boost::timer Boost::thread)
add_dependencies(qlib  generate_headers)
