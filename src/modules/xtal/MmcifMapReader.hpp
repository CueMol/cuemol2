// -*-Mode: C++;-*-
//
// mmCIF format macromolecule map reader class
//

#pragma once

#include <qlib/LExceptions.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/mcutils.hpp>
#include <qsys/ObjReader.hpp>

#include "CifParser.hpp"
#include "xtal.hpp"

namespace qlib {
class LineStream;
}

// class MTZ2MapReader_wrap;

namespace xtal {

class DensityMap;

//
///   mmCIF map reader class
//
class XTAL_API MmcifMapReader : public qsys::ObjReader, CifParserClient
{
    MC_SCRIPTABLE;

public:
private:
    /// target map object
    DensityMap *m_pMap;

    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    /// Unit cell dimension parameters
    double m_cella, m_cellb, m_cellc;
    double m_alpha, m_beta, m_gamma;

    /// Space group no.
    int m_nSG;

    /// Map (max; high) resolution (default: auto)
    double m_mapr;

    /// Map grid size (default: 0.33)
    double m_grid;

public:
    //////////////////////////////////////////////
    // properties

public:
    MmcifMapReader();

    virtual ~MmcifMapReader();

    //////////////////////////////////////////////
    // Read/build methods

    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// get file-type description
    virtual const char *getTypeDescr() const;

    /// get file extension
    virtual const char *getFileExt() const;

    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    /// Content sniffer: YES when the header carries a `_refln.` CIF
    /// category (this reader's structure-factor target), NO when it
    /// carries `_atom_site.` instead (an MmcifMolReader file), UNKNOWN
    /// otherwise. Scans up to ~200 lines or the end of the peek buffer.
    virtual int canHandleContent(qlib::InStream &ins) const;

    //////////////////////////////////////////////

    virtual void readDataItem(CifParser &parser);

    double getResoln() const
    {
        return m_mapr;
    }
    void setResoln(double val)
    {
        m_mapr = val;
    }
    double getGridSize() const
    {
        return m_grid;
    }
    void setGridSize(double val)
    {
        m_grid = val;
    }

private:
    struct Refln
    {
        int h;
        int k;
        int l;
        float fwt;
        float phwt;
    };
    std::deque<Refln> m_data;

    void readCellLine(CifParser &parser);
    void readSymmLine(CifParser &parser);
    void readReflnLine(CifParser &parser);

    void error(const LString &msg) const;
    void warning(const LString &msg) const;
};

}  // namespace xtal
