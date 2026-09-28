// -*-Mode: C++;-*-
//
// LabelFormat.hpp --- the text of an atom label, from a format string
//

#ifndef MOLSTR_LABEL_FORMAT_HPP_INCLUDED
#define MOLSTR_LABEL_FORMAT_HPP_INCLUDED

#include "molstr.hpp"
#include "MolAtom.hpp"

#include <vector>

namespace molstr {

/// A parsed label format such as "{resn}{resi} {name}" or "{bfac:.2f}".
///
/// Fields are written {field} or {field:spec}; the spec is that of
/// std::format ([[fill]align][sign][width][.precision][type]) and `{{` / `}}`
/// stand for literal braces. The field names are the words of the CueMol
/// selection language:
///
///   name    atom name          resn   residue name
///   resi    residue number, with the insertion code (a string)
///   chain   chain name         elem   element symbol
///   bfac    B-factor (real)    occ    occupancy (real)
///   alt     alternate location ID ("" when none)
///   aid     atom ID (integer)  molname  name of the molecule
///   aprop.<name>  atom property (its own type)
///   rprop.<name>  residue property (a string)
///
/// An atom or residue property that is not set formats as "".
class MOLSTR_API LabelFormat
{
public:
    /// Parse and check `fmt`.
    /// @throws qlib::IllegalArgumentException naming the field and position
    ///   for an unknown field, a bad brace, or a spec the field's type cannot
    ///   take (e.g. {name:.2f}).
    explicit LabelFormat(const LString &fmt);

    /// The label text for `pAtom`.
    ///
    /// Does not throw: an atom or residue property whose value its spec
    /// cannot format (the type is only known at run time) comes out as "?".
    LString apply(const MolAtomPtr &pAtom) const;

    /// Whether `fmt` parses, with the reason in `err` when it does not.
    static bool check(const LString &fmt, LString &err);

private:
    enum FieldID {
        LIT = 0,
        NAME,
        RESN,
        RESI,
        CHAIN,
        ELEM,
        BFAC,
        OCC,
        ALT,
        AID,
        MOLNAME,
        APROP,
        RPROP
    };

    struct Seg {
        FieldID id;
        /// Literal text for LIT, the property name for APROP / RPROP.
        LString text;
        /// std::format spec, without the leading ':'.
        LString spec;
    };

    std::vector<Seg> m_segs;
};

}  // namespace molstr

#endif
