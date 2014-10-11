// -*-Mode: C++;-*-
//
// Abstract class for QDF writer classes
//
// $Id: QdfAbsWriter.cpp,v 1.3 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "QdfAbsWriter.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/GzipStream.hpp>

using namespace qsys;

QdfAbsWriter::QdfAbsWriter()
     : m_pOut(NULL)
{
}

QdfAbsWriter::~QdfAbsWriter()
{
  if (m_pOut!=NULL)
    delete m_pOut;
}

void QdfAbsWriter::start(qlib::OutStream &outs)
{
  MB_ASSERT(m_pOut==NULL);
  m_pOut = MB_NEW QdfOutStream(outs);
  m_pOut->setEncType(m_encStr);
  MB_ASSERT(!m_strFileType.isEmpty());
  m_pOut->setFileType(m_strFileType);
  m_pOut->start();
}

void QdfAbsWriter::end()
{
  if (m_pOut==NULL) return;
  
  m_pOut->end();
  delete m_pOut;
  m_pOut = NULL;
}

