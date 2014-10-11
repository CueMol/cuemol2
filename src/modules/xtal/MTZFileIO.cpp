// -*-Mode: C++;-*-
// CCP4 MTZ reflection file I/O
// $Id: MTZFileIO.cpp,v 1.1 2010/01/16 15:32:08 rishitani Exp $

#ifdef WIN32
#pragma warning(disable:4786)
#endif

#include "MTZFileIO.hpp"

// default constructor
MTZFileIO::MTZFileIO()
  : CCP4FileIO()
{
  m_fp = NULL;
}

// destructor
MTZFileIO::~MTZFileIO()
{
  m_colAttrs.clear();
}

void MTZFileIO::cleanUpColAttrs()
{
  m_colAttrs.clear();
}

///////////////////////////////////////////

// read CCP4 format map file from "filename"
bool MTZFileIO::read(const char *filename)
{
  FILE *fp = fopen_pathconv(filename, "rb");

  if (fp==NULL) {
    MB_DPRINT("cannot open file %s : %s\n",filename,strerror(errno));
    return false;
  }

  bool retval = read(fp);

  if (!retval)
    fclose(fp);

  return retval;
}

void MTZFileIO::close()
{
  fclose(m_fp);
  m_fp = NULL;
}

// read CCP4 format map file from stream
bool MTZFileIO::read(FILE *fp)
{
  char sbuf[256];

  ////////////////////////////////////////////
  // check the map file type

  // fseek(fp, 0, SEEK_SET);
  int res = fread(sbuf, 4, 1, fp);
  if (res!=1) {
    MB_DPRINTLN("MTZFileIO: read error.");
    return false;
  }

  sbuf[4] = '\0';
  if (strcmp(sbuf, "MTZ ")!=0) {
    MB_DPRINTLN("MTZFileIO read: format error.");
    return false;
  }

  fseek(fp, 8, SEEK_SET);
  res = fread(sbuf, 4, 1, fp);
  if (res!=1) {
    MB_DPRINTLN("MTZFileIO: read error.");
    return false;
  }

  int iType = (sbuf[1]>>4) & 0x0F;
  int fType = (sbuf[0]>>4) & 0x0F;

  if (!setFileByteOrder(iType, fType)) {
    MB_DPRINTLN("MTZFileIO: read error.");
    return false;
  }

  bool ferr = true;

  // skip to the header record
  for ( ;; ) {
    int hdrpos;
    if (fseek(fp, 4, SEEK_SET)<0)
      break;
    if (!fetch_int(fp, hdrpos))
      break;
    
    hdrpos--;
    MB_DPRINT("hdrpos is %d\n", hdrpos);
    if (fseek(fp, hdrpos*4, SEEK_SET)<0)
      break;

    ferr = false;
    break;
  }
  if (ferr) {
    MB_DPRINT("MTZFileIO read: failed to seek to the hdrrec.\n");
    return false;
  }

  while (!feof(fp)) {
    fread(sbuf, 80, sizeof(char), fp);
    sbuf[80] = '\0';
    if (!readhdr(sbuf))
      return false;
  }

  m_fp = fp;
  return true;
}

bool MTZFileIO::readhdr(char *sbuf)
{
  char *pstr;

  if ((pstr = strtok((char *)sbuf, " " )) != NULL) {
    if (strncmp(pstr, "NCOL", 4)==0) {
      if (!read_ncol())
	return false;
    }
    else if (strncmp(pstr, "CELL", 4)==0) {
      if (!read_cell())
	return false;
    }
    else if (strncmp(pstr, "COL", 3)==0) {
      if (!read_col())
	return false;
    }
    else {
      MB_DPRINT("unprocessed hdr: %s\n", sbuf);
    }
  }

  return true;
}

bool MTZFileIO::read_ncol()
{
  char *pstr = strtok((char *)NULL, " " );
  if (pstr==NULL) {
    MB_DPRINT("mtzread error : read NCOL\n");
    return false;
  }
  m_ncol = atoi(pstr);

  pstr = strtok((char *)NULL, " " );
  if (pstr==NULL) {
    MB_DPRINT("mtzread error : read NCOL\n");
    return false;
  }
  m_nrefl = atoi(pstr);

  printf("ncol:%d, nrefl:%d\n", m_ncol, m_nrefl);

  cleanUpColAttrs();

  m_icol = 0;

  return true;
}

bool MTZFileIO::read_col()
{
  char *pstr = strtok((char *)NULL, " " );
  if (pstr==NULL) {
    MB_DPRINT("mtzread error : read COLUMN\n");
    return false;
  }
  ColAttr *pColAttr = new ColAttr;
  pColAttr->colName = pstr;
  pColAttr->nStartPos = m_icol;

  pstr = strtok((char *)NULL, " " );
  if (pstr==NULL) {
    MB_DPRINT("mtzread error : read COLUMN\n");
    return false;
  }
  pColAttr->colType = pstr[0];

  MB_DPRINT("col:%s, type:%c\n",
	    (const char *)pColAttr->colName,
	    pColAttr->colType);
  m_icol++;

  m_colAttrs.put(pColAttr->colName, pColAttr);

  return true;
}

bool MTZFileIO::read_cell()
{
  for ( ;; ) {
    char *pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_cella = atof(pstr);

    pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_cellb = atof(pstr);

    pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_cellc = atof(pstr);

    pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_alpha = atof(pstr);

    pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_beta = atof(pstr);
    
    pstr = strtok((char *)NULL, " " );
    if (pstr==NULL) break;
    m_gamma = atof(pstr);

    MB_DPRINT("unit cell dimension "
	      "a=%.2f, b=%.2f, c=%.2f, "
	      "alpha=%.2f, beta=%.2f, gamma=%.2f\n",
	      m_cella, m_cellb, m_cellc, m_alpha, m_beta, m_gamma);
    return true;
  }

  MB_DPRINT("mtzread error : read CELL\n");
  return false;
}

///////////////

// read mirror indices
bool MTZFileIO::readData(ReflData *pdata)
{
  /*
  ColAttr *pHCol = m_colAttrs.get("H");
  if (pHCol==NULL) {
    MB_DPRINT("Mirror index column H not found.\n");
    return false;
  }

  ColAttr *pKCol = m_colAttrs.get("K");
  if (pKCol==NULL) {
    MB_DPRINT("Mirror index column K not found.\n");
    return false;
  }

  ColAttr *pLCol = m_colAttrs.get("L");
  if (pLCol==NULL) {
    MB_DPRINT("Mirror index column L not found.\n");
    return false;
  }

  if (fseek(m_fp, MTZ_HDRSIZE*4, SEEK_SET)<0) {
    perror("");
    return false;
  }

  // allocate memory
  if (!pdata->setSize(m_nrefl))
    return false;

  pdata->setCellDim(m_cella, m_cellb, m_cellc);

  // read HKL column
  {
    float *pfbuf = new float[m_ncol];
    int hpos = pHCol->nStartPos;
    int kpos = pKCol->nStartPos;
    int lpos = pLCol->nStartPos;

    for (int i=0; i<m_nrefl; i++) {
      fetch_floatArray(m_fp, pfbuf, m_ncol);
      float h = pfbuf[hpos], k = pfbuf[kpos],l = pfbuf[lpos];
      //MB_DPRINT("index hkl:%.1f %.1f %.1f\n", h, k, l);
      pdata->setIndex(i, (int)floor(h),
		      (int)floor(k), (int)floor(l));

      for (pdata->colFirst(); pdata->colMore(); pdata->colNext()) {
	const LString &name = pdata->colGetName();
	ColAttr *pCol = m_colAttrs.get(name);
	if (pCol==NULL) continue;
	float value = pfbuf[pCol->nStartPos];
	pdata->colSetCurData(i, value);
	//MB_DPRINT("DATA %s=%f\n", (const char *)name, value);
      }
    }
    delete [] pfbuf;
  }
  */
  return true;
}

