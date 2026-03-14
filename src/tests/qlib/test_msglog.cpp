#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LMsgLog.hpp"
#include <cstdio>
#include <string>

using qlib::LMsgLog;
using qlib::LString;

static LMsgLog *getLog()
{
    return LMsgLog::getInstance();
}

TEST(LMsgLog, InstanceNotNull)
{
    EXPECT_NE(getLog(), nullptr);
}

// writeLog() only accumulates messages with nlev <= DL_WARN (0 or 10).
// DL_NOTIFY(20) and DL_VERBOSE(30) skip accumulation.

TEST(LMsgLog, AccumMsg)
{
    LMsgLog *log = getLog();

    log->writeLog(LMsgLog::DL_WARN, "warn message");
    LString msg = log->getAccumMsg();
    EXPECT_FALSE(msg.isEmpty());
    EXPECT_GE(msg.indexOf(LString("warn message")), 0);
}

TEST(LMsgLog, AccumMsgError)
{
    LMsgLog *log = getLog();

    log->writeLog(LMsgLog::DL_ERROR, "err message");
    LString msg = log->getAccumMsg();
    EXPECT_GE(msg.indexOf(LString("err message")), 0);
}

TEST(LMsgLog, NotifyNotAccumulated)
{
    // DL_NOTIFY is above DL_WARN threshold and is NOT accumulated
    LMsgLog *log = getLog();

    // Verify getAccumMsg does not contain a unique sentinel written at DL_NOTIFY
    log->writeLog(LMsgLog::DL_NOTIFY, "notify_sentinel_xyz");
    LString msg = log->getAccumMsg();
    EXPECT_LT(msg.indexOf(LString("notify_sentinel_xyz")), 0);
}

TEST(LMsgLog, WriteErr)
{
    LMsgLog *log = getLog();
    log->writeErr("error text");
    LString msg = log->getAccumMsg();
    EXPECT_GE(msg.indexOf(LString("error text")), 0);
}

TEST(LMsgLog, WriteErrLn)
{
    LMsgLog *log = getLog();
    log->writeErrLn("error line");
    LString msg = log->getAccumMsg();
    EXPECT_GE(msg.indexOf(LString("error line")), 0);
}

TEST(LMsgLog, RemoveAccumMsgClearsBuffer)
{
    // removeAccumMsg() clears the accumulated buffer
    LMsgLog *log = getLog();
    log->writeLog(LMsgLog::DL_ERROR, "before remove");
    EXPECT_GE(log->getAccumMsg().indexOf(LString("before remove")), 0);

    log->removeAccumMsg();
    EXPECT_TRUE(log->getAccumMsg().equals(""));
}

TEST(LMsgLog, RemoveAccumMsgStopsAccumulation)
{
    // After removeAccumMsg(), further writes are NOT accumulated
    LMsgLog *log = getLog();
    log->removeAccumMsg();

    log->writeLog(LMsgLog::DL_ERROR, "after remove");
    EXPECT_TRUE(log->getAccumMsg().equals(""));
}

TEST(LMsgLog, FileRedirDefaultEmpty)
{
    // Default redirection path is empty (no file redirection at startup)
    LMsgLog *log = getLog();
    EXPECT_TRUE(log->getFileRedirPath().equals(""));
}

TEST(LMsgLog, FileRedirPath)
{
    LMsgLog *log = getLog();

    char tmppath[256];
    std::snprintf(tmppath, sizeof(tmppath), "/tmp/cuemol_msglog_test_%d.txt",
                  (int)getpid());

    log->setFileRedirPath(tmppath);
    EXPECT_TRUE(log->getFileRedirPath().equals(tmppath));

    log->writeLog(LMsgLog::DL_NOTIFY, "redir test", true);
    log->setFileRedirPath("");
    EXPECT_TRUE(log->getFileRedirPath().equals(""));

    FILE *fp = std::fopen(tmppath, "r");
    ASSERT_NE(fp, nullptr);
    char buf[256] = {};
    std::fread(buf, 1, sizeof(buf) - 1, fp);
    std::fclose(fp);
    std::remove(tmppath);

    EXPECT_NE(std::string(buf).find("redir test"), std::string::npos);
}
