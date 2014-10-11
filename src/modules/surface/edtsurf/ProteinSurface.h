/*////////////////////////////////////////////////////////////////
Permission to use, copy, modify, and distribute this program for
any purpose, with or without fee, is hereby granted, provided that
the notices on the head, the reference information, and this
copyright notice appear in all copies or substantial portions of
the Software. It is provided "as is" without express or implied
warranty.
 */

///////////////////////////////////////////////////////////////
// ProteinSurface.h: interface for the ProteinSurface class.
//

#ifndef EDTSURF_PROTEIN_SURFACE_H
#define EDTSURF_PROTEIN_SURFACE_H

namespace edtsurf {

  struct point3d
  {
    double x,y,z;
  };

  struct point3s
  {
    float x,y,z;
  };

  struct volumepixel
  {
    int atomid;
    float distance;
    bool inout;
    bool isbound;
    bool isdone;
  };

  struct voxel
  {
    int ix,iy,iz;
  };

  struct voxel2
  {
    short int ix,iy,iz;
  };

  struct faceinfo
  {
    int a,b,c;
    point3d pn;
    double area;
    bool inout;//interior true
  };

  struct vertinfo
  {
    double x,y,z;
    point3d pn;
    double area;
    int atomid;
    bool inout;
    bool iscont;//is concave surface
  };

  class ProteinSurface
  {
  public:
    static const int NO_RAD_TYPES = 13;

    //static double rasrad[ ]=
    // {1.872,1.872,1.507,1.4,1.848,1.1,1.88,1.872,1.507,1.948,1.5, 1.4, 1.1};//lsms
    //static double rasrad[ ]=
    //{1.90,1.88,1.63,1.48,1.78,1.2,1.87,1.96,1.63,0.74,1.8, 1.48, 1.2};//liang
    //                         ca   c    n    o    s    h   p   cb    ne   fe  other ox  hx

    /// atom radii
    double rasrad[NO_RAD_TYPES];

    /// size of depty array (int(tradius) + 1)
    int widxz[NO_RAD_TYPES];

    /// distance function (for each atom type; widxz[i] x widxz[i])
    int *depty[NO_RAD_TYPES];


    point3d ptran;
    int boxlength;
    bool flagradius;
    double proberadius;
    double fixsf;
    double scalefactor;
    point3d pmin,pmax;
    int pheight,pwidth,plength;
    double cutradis;
    volumepixel ***vp;

    voxel2* inarray;
    voxel2* outarray;
    int totalsurfacevox;
    int totalinnervox;
    faceinfo *faces;
    vertinfo *verts;
    int facenumber, vertnumber;

    double carea,cvolume;
    double sarea,svolume;

    int ncav;
    double *eachcavityvolume;

    //////////

    ProteinSurface();
    virtual ~ProteinSurface();

    void boundbox(int seqinit,int seqterm,atom *proseq,bool atomtype,point3d *minp,point3d *maxp);

    void boundingatom(bool btype);
    void initpara(int seqinit,int seqterm,atom* proseq,bool atomtype,bool btype);
    void fillvoxels(int seqinit,int seqterm,bool atomtype,atom* proseq,bool bcolor);
    void fillatom(int indx,atom* proseq,bool bcolor);
    void fillatomwaals(int indx,atom* proseq,bool bcolor);
    void fillvoxelswaals(int seqinit,int seqterm,bool atomtype,atom* proseq,bool bcolor);
    void fastoneshell(int* innum,int *allocout,voxel2 ***boundpoint,int* outnum, int *elimi);
    void fastdistancemap();
    void buildboundary();

    void marchingcubeinit(int stype);
    void marchingcubeorigin(int stype);
    void marchingcubeorigin2(int stype);
    void marchingcube(int stype);

    void calcareavolume();
    void computenorm();

    void cavitynumbers();
    void cavitiesareavolume();
    void outputcavityatoms(int seqinit,int seqterm,atom* proseq,char *filename);
    void surfaceinterior();
    void atomsinout(int seqinit,int seqterm,atom* proseq);

    void laplaciansmooth(int numiter);
    void checkEuler();
    void checkinoutpropa();

  };

}

#endif

