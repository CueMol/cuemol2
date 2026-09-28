// -*-Mode: C++;-*-
//
// LabelFormat.cpp --- the text of an atom label, from a format string
//

#include <common.h>

#include "LabelFormat.hpp"

#include "MolCoord.hpp"
#include "MolResidue.hpp"

#include <qlib/LExceptions.hpp>
#include <qlib/LVariant.hpp>

#include <spdlog/fmt/bundled/format.h>

namespace molstr {

namespace {

/// One value formatted with a std::format spec ("" means as is).
template <typename T>
LString formatOne(const LString &spec, const T &value)
{
    const std::string f = "{:" + std::string(spec.c_str()) + "}";
    return LString::vfmtFormat(f, fmt::make_format_args(value));
}

/// An atom property with its own type, formatted with `spec`.
LString formatAtomProp(const LString &spec, const qlib::LVariant &v)
{
    if (v.isInt()) {
        const int n = v.getIntValue();
        return formatOne(spec, n);
    }
    if (v.isReal()) {
        const double d = v.getRealValue();
        return formatOne(spec, d);
    }
    if (v.isBool()) {
        const bool b = v.getBoolValue();
        return formatOne(spec, b);
    }
    if (v.isString()) {
        const std::string s = v.getStringValue().c_str();
        return formatOne(spec, s);
    }
    return LString();
}

}  // namespace

LabelFormat::LabelFormat(const LString &fmtstr)
{
    const std::string f = fmtstr.c_str();
    const size_t n = f.size();
    std::string lit;

    auto fail = [&](size_t pos, const std::string &why) {
        LString msg = LString::fmtFormat("label format \"{}\": {} (at {})", f, why, pos);
        MB_THROW(qlib::IllegalArgumentException, msg);
    };
    auto flushLit = [&]() {
        if (!lit.empty()) {
            m_segs.push_back(Seg{LIT, LString(lit), LString()});
            lit.clear();
        }
    };

    for (size_t i = 0; i < n; ++i) {
        const char c = f[i];
        if (c == '}') {
            if (i + 1 < n && f[i + 1] == '}') {
                lit += '}';
                ++i;
                continue;
            }
            fail(i, "a single '}' (write '}}' for a brace)");
        }
        if (c != '{') {
            lit += c;
            continue;
        }
        if (i + 1 < n && f[i + 1] == '{') {
            lit += '{';
            ++i;
            continue;
        }

        const size_t close = f.find('}', i + 1);
        if (close == std::string::npos) fail(i, "'{' is not closed");
        const std::string body = f.substr(i + 1, close - i - 1);
        if (body.find('{') != std::string::npos) fail(i, "a field cannot contain '{'");

        const size_t colon = body.find(':');
        const std::string name = body.substr(0, colon);
        const std::string spec = colon == std::string::npos ? "" : body.substr(colon + 1);

        Seg seg{LIT, LString(), LString(spec)};
        // The dummy value checks the spec against the field's type now, so
        // a bad format is refused when it is set rather than drawn wrong.
        enum { STR, REAL, INT, ANY } type = STR;
        if (name == "name") seg.id = NAME;
        else if (name == "resn") seg.id = RESN;
        else if (name == "resi") seg.id = RESI;
        else if (name == "chain") seg.id = CHAIN;
        else if (name == "elem") seg.id = ELEM;
        else if (name == "bfac") { seg.id = BFAC; type = REAL; }
        else if (name == "occ") { seg.id = OCC; type = REAL; }
        else if (name == "alt") seg.id = ALT;
        else if (name == "aid") { seg.id = AID; type = INT; }
        else if (name == "molname") seg.id = MOLNAME;
        else if (name.rfind("aprop.", 0) == 0 && name.size() > 6) {
            seg.id = APROP;
            seg.text = name.substr(6);
            type = ANY;
        }
        else if (name.rfind("rprop.", 0) == 0 && name.size() > 6) {
            seg.id = RPROP;
            seg.text = name.substr(6);
        }
        else {
            fail(i, "unknown field '" + name +
                        "' (name, resn, resi, chain, elem, bfac, occ, alt, aid, molname, "
                        "aprop.<name>, rprop.<name>)");
        }

        try {
            if (type == STR) formatOne(seg.spec, std::string());
            else if (type == REAL) formatOne(seg.spec, 0.0);
            else if (type == INT) formatOne(seg.spec, 0);
        }
        catch (const fmt::format_error &e) {
            fail(i, "'" + body + "': " + e.what());
        }

        flushLit();
        m_segs.push_back(seg);
        i = close;
    }
    flushLit();
}

LString LabelFormat::apply(const MolAtomPtr &pAtom) const
{
    std::string out;
    for (const Seg &s : m_segs) {
        if (s.id == LIT) {
            out += s.text.c_str();
            continue;
        }
        try {
            switch (s.id) {
                case NAME:
                    out += formatOne(s.spec, std::string(pAtom->getName().c_str())).c_str();
                    break;
                case RESN:
                    out += formatOne(s.spec, std::string(pAtom->getResName().c_str())).c_str();
                    break;
                case RESI:
                    out += formatOne(s.spec, std::string(pAtom->getResIndex().toString().c_str()))
                               .c_str();
                    break;
                case CHAIN:
                    out += formatOne(s.spec, std::string(pAtom->getChainName().c_str())).c_str();
                    break;
                case ELEM:
                    out += formatOne(s.spec, std::string(pAtom->getElementName().c_str())).c_str();
                    break;
                case BFAC:
                    out += formatOne(s.spec, pAtom->getBfac()).c_str();
                    break;
                case OCC:
                    out += formatOne(s.spec, pAtom->getOcc()).c_str();
                    break;
                case ALT: {
                    const char c = pAtom->getConfID();
                    const std::string alt = (c == '\0' || c == ' ') ? "" : std::string(1, c);
                    out += formatOne(s.spec, alt).c_str();
                    break;
                }
                case AID:
                    out += formatOne(s.spec, pAtom->getID()).c_str();
                    break;
                case MOLNAME: {
                    MolCoordPtr pMol =
                        MolCoord::getMolByID(pAtom->getParentUID(), qlib::no_throw_tag());
                    const std::string nm = pMol.isnull() ? "" : pMol->getName().c_str();
                    out += formatOne(s.spec, nm).c_str();
                    break;
                }
                case APROP: {
                    qlib::LVariant v;
                    if (pAtom->getAtomProp(s.text, v)) out += formatAtomProp(s.spec, v).c_str();
                    break;
                }
                case RPROP: {
                    MolResiduePtr pRes = pAtom->getParentResidue();
                    LString val;
                    if (!pRes.isnull() && pRes->getPropStr(s.text.c_str(), val))
                        out += formatOne(s.spec, std::string(val.c_str())).c_str();
                    break;
                }
                case LIT:
                    break;
            }
        }
        catch (const fmt::format_error &) {
            // Only a run-time typed property gets here: its spec was not
            // checkable when the format was set.
            out += "?";
        }
    }
    return LString(out);
}

bool LabelFormat::check(const LString &fmtstr, LString &err)
{
    try {
        LabelFormat f(fmtstr);
        return true;
    }
    catch (const qlib::LException &e) {
        err = e.getMsg();
        return false;
    }
}

}  // namespace molstr
