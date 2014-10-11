// -*-Mode: C++;-*-
//
// Image scene output class
//

#ifndef PNG_SCENE_EXPORTER_HPP_INCLUDED_
#define PNG_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include "ImgSceneExporter.hpp"

class PngSceneExporter_wrap;

namespace qlib {
  class FileOutStream;
}

namespace render {

class RENDER_API PngSceneExporter : public ImgSceneExporter
{
  MC_SCRIPTABLE;

  friend class ::PngSceneExporter_wrap;
  typedef ImgSceneExporter super_t;

private:
  
  void *m_pPNG;
  void *m_pPNGInfo;

  bool m_bIntrl;
  int m_nCompLev;

public:
  PngSceneExporter();
  virtual ~PngSceneExporter();

  /////////////////////////////////

  /// Get name of the writer
  virtual const char *getName() const;

  /// Get file-type description
  virtual const char *getTypeDescr() const;

  /// Get file extension
  virtual const char *getFileExt() const;

  ////////////////////////////////////////

  virtual int prepare(const char *filename);
  // virtual bool request(int &posx, int &posy, int &width, int &height);
  virtual void writeData(const char *pbuf, int nsize);
  virtual void completed();

};

}

#endif

