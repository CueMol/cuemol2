// -*-Mode: C++;-*-

#include <common.h>

#include "TagName.hpp"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string_view>
#include <unordered_map>

using namespace qlib;

namespace {

// Strings live in fixed-size chunks that never move, reached through a
// fixed-size directory. A reader only loads one directory slot, so lookup()
// needs no lock even while another thread registers new strings.
constexpr int kChunkBits = 12;
constexpr TagID kChunkSize = TagID(1) << kChunkBits;
constexpr TagID kChunkMask = kChunkSize - 1;
constexpr int kMaxChunks = 1 << 14;

struct TagNameTable
{
    std::atomic<LString *> m_dir[kMaxChunks];

    /// Serializes registration (m_index and m_nNext)
    std::mutex m_mtx;

    /// String -> ID; the views point into the chunk storage
    std::unordered_map<std::string_view, TagID> m_index;

    TagID m_nNext;

    TagNameTable() : m_nNext(1)
    {
        for (int i = 0; i < kMaxChunks; ++i) m_dir[i].store(NULL, std::memory_order_relaxed);
        // Slot 0 is the empty string (TAG_NULL).
        LString *pChunk = new LString[kChunkSize];
        m_dir[0].store(pChunk, std::memory_order_release);
    }

    TagID intern(const char *pstr, size_t len)
    {
        if (len == 0) return TagName::TAG_NULL;
        const std::string_view key(pstr, len);

        std::lock_guard<std::mutex> lock(m_mtx);
        auto iter = m_index.find(key);
        if (iter != m_index.end()) return iter->second;

        const TagID id = m_nNext;
        const TagID ichunk = id >> kChunkBits;
        if (ichunk >= TagID(kMaxChunks)) {
            std::fprintf(stderr, "TagName table is full.\n");
            std::abort();
        }
        LString *pChunk = m_dir[ichunk].load(std::memory_order_relaxed);
        if (pChunk == NULL) {
            pChunk = new LString[kChunkSize];
            m_dir[ichunk].store(pChunk, std::memory_order_release);
        }
        LString &slot = pChunk[id & kChunkMask];
        slot = LString(std::string(pstr, len));
        m_index.emplace(std::string_view(slot.c_str(), len), id);
        ++m_nNext;
        return id;
    }

    const LString &lookup(TagID id) const
    {
        const LString *pChunk = m_dir[id >> kChunkBits].load(std::memory_order_acquire);
        return pChunk[id & kChunkMask];
    }
};

// Never destroyed: TagNames may be read by static destructors.
TagNameTable &table()
{
    static TagNameTable *s_pTable = new TagNameTable();
    return *s_pTable;
}

}  // namespace

TagID TagName::intern(const char *pstr)
{
    if (pstr == NULL) return TAG_NULL;
    return table().intern(pstr, std::strlen(pstr));
}

TagID TagName::intern(const LString &str)
{
    return table().intern(str.c_str(), static_cast<size_t>(str.length()));
}

const LString &TagName::lookup(TagID id)
{
    return table().lookup(id);
}

int TagName::getTableSize()
{
    TagNameTable &tab = table();
    std::lock_guard<std::mutex> lock(tab.m_mtx);
    return static_cast<int>(tab.m_nNext) - 1;
}
