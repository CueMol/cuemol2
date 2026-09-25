// -*-Mode: C++;-*-
//
// TagName: an interned string held as a 32-bit ID.
//
// Names that repeat across millions of objects (atom, residue and chain names)
// are stored once in a process-wide table, and each holder keeps only the ID.
// Entries are never removed, so a TagName stays valid for the life of the
// process and str() can hand out a reference into the table.
//

#ifndef QLIB_TAG_NAME_HPP_INCLUDED
#define QLIB_TAG_NAME_HPP_INCLUDED

#include "qlib.hpp"

#include "LTypes.hpp"
#include "LString.hpp"

namespace qlib {

typedef quint32 TagID;

class QLIB_API TagName
{
public:
    /// ID of the empty string
    enum { TAG_NULL = 0 };

private:
    TagID m_id;

public:
    TagName() : m_id(TAG_NULL) {}

    TagName(const char *pstr) : m_id(intern(pstr)) {}

    TagName(const LString &str) : m_id(intern(str)) {}

    TagID getID() const { return m_id; }

    /// The string this name stands for (a reference into the table)
    const LString &str() const { return lookup(m_id); }

    operator const LString &() const { return str(); }

    const char *c_str() const { return str().c_str(); }

    int length() const { return str().length(); }

    bool isEmpty() const { return m_id == TAG_NULL; }

    bool equals(const TagName &arg) const { return m_id == arg.m_id; }

    bool equals(const char *arg) const { return str().equals(arg); }

    bool equals(const LString &arg) const { return str().equals(arg); }

    /// Compares the strings (not the IDs, which follow registration order)
    int compare(const TagName &arg) const { return str().compare(arg.str()); }

    bool operator==(const TagName &arg) const { return m_id == arg.m_id; }

    bool operator!=(const TagName &arg) const { return m_id != arg.m_id; }

    //////////
    // table access

    /// Returns the ID of str, registering it when it is new. Thread-safe.
    static TagID intern(const char *pstr);
    static TagID intern(const LString &str);

    /// Returns the string of a registered ID. Lock-free.
    static const LString &lookup(TagID id);

    /// Number of registered strings (the empty string not included)
    static int getTableSize();
};

}  // namespace qlib

#endif  // QLIB_TAG_NAME_HPP_INCLUDED
