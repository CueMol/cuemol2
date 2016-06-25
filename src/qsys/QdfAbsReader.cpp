// -*-Mode: C++;-*-
//
// Abstract class for QDF reader classes
//
// $Id: QdfAbsReader.cpp,v 1.2 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "QdfAbsReader.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/LChar.hpp>

using namespace qsys;

QdfAbsReader::QdfAbsReader()
     : m_pQdfIn(NULL)
{
}

QdfAbsReader::~QdfAbsReader()
{
  if (m_pQdfIn!=NULL)
    delete m_pQdfIn;
}

