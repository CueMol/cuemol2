//
// POSIX thread/process manager implementation
//

#include "LRegExpr.hpp"
#include <errno.h>
#include <fcntl.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>

#define HAVE_POSIX_SPAWN 1

#ifdef HAVE_SPAWN_H
# include <spawn.h>
#else
# error "require posix spawn"
#endif

#ifdef HAVE_SYS_WAIT_H
#  include <sys/wait.h>
#endif

#ifndef STDIN_FILENO
# define STDIN_FILENO 0
#endif
#ifndef STDOUT_FILENO
# define STDOUT_FILENO 1
#endif
#ifndef STDERR_FILENO
# define STDERR_FILENO 2
#endif

#if (__cplusplus>=201103L || __GXX_EXPERIMENTAL_CXX0X__)
#define HANDLE_EINTR(x) ({                                \
      decltype(x) __eintr_result__;                         \
      do {                                                \
        __eintr_result__ = x;                             \
      } while (__eintr_result__ == -1 && errno == EINTR); \
      __eintr_result__;                                   \
    })
#else
#define HANDLE_EINTR(x) ({                                \
      typeof(x) __eintr_result__;                         \
      do {                                                \
        __eintr_result__ = x;                             \
      } while (__eintr_result__ == -1 && errno == EINTR); \
      __eintr_result__;                                   \
    })
#endif 

// Passed to posix_spawnp to inherit all env variables
extern "C" char **environ;

namespace qlib {

class PosixInThread : public ProcInThread
{
public:

  pid_t m_childpid;
  int m_infd;

  virtual void run()
  {
    // Read output from the child process's pipe for STDOUT
    const int kBufferSize = 1024*64; // 64 kB buf
    char sbuf[kBufferSize];

    try {
      for (;;) {
	ssize_t bytes_read =
	  HANDLE_EINTR( ::read(m_infd, sbuf, sizeof(sbuf)-1) );
	if (bytes_read <= 0)
	  break;
	sbuf[bytes_read] = '\0';
	printf("child(%d): %s", m_childpid, sbuf);

	{
	  boost::mutex::scoped_lock lck(m_lock);
	  m_sbuf.append(sbuf);
	}
      }

      // Let's wait for the process to finish.

      int status;
      if (HANDLE_EINTR( ::waitpid(m_childpid, &status, 0) )== -1) {
	LOG_DPRINTLN("PosixInThr: waitpid failed");
	::close(m_infd);
	return;
      }

      if (WIFEXITED(status)) {
	m_nExitCode = WEXITSTATUS(status);
	MB_DPRINTLN("child(%d) exited with code %d", m_childpid, m_nExitCode);
      }

      ::close(m_infd);
      MB_DPRINTLN("WD thread done");
    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("ProcThr> Exception occurred in proc thr: %s", e.getMsg().c_str());
    }
    catch (...) {
      LOG_DPRINTLN("ProcMgr> Unknown exception occurred in proc thr (ignored)");
    }
  }
};

class PosixProcMgrImpl : public LProcMgrImpl
{
public:
  virtual int getCPUCount() const
  {
    // TO DO: impl
    return 4;
  }

  LString replaceEsc(const LString &token)
  {
    LString rval = token;
    if (rval.startsWith("\""))
      rval = rval.substr(1);
    if (rval.endsWith("\"")) {
      int len = rval.length();
      rval = rval.substr(0, len-1);
    }
    
    rval.replace("\\ ", " ");
    rval.replace("\\\"", "\"");
    return rval;
  }

  // parse the space-separated list of the commandline argument
  bool parseCmdLine(const LString &args,
		    std::vector<LString> &data)
  {
    qlib::LRegExpr re("\"(?:\\\\\"|[^\"])*\"|(?:\\\\ |[^ ])+");
    
    LString sbuf = args;
    for (;;) {
      if (re.match(sbuf)) {
	LString m = re.getSubstr(0);
	MB_DPRINTLN("matched: %s", m.c_str());

	int ind = sbuf.indexOf(m);
	if (ind>0) {
	  LString token = sbuf.substr(0, ind);
	  // data.push_back(token);
	  sbuf = sbuf.substr(ind);
	  MB_DPRINTLN("ws: [%s]", token.c_str());
	}

	int len = m.length();
	LString token = replaceEsc( sbuf.substr(0, len) );
	data.push_back(token);
	sbuf = sbuf.substr(len);
	MB_DPRINTLN("token: [%s]", token.c_str());
      }
      else {
	if (!sbuf.isEmpty()) {
	  LString token = replaceEsc(sbuf);
	  data.push_back(token);
	  MB_DPRINTLN("last token: [%s]", token.c_str());
	}
	break;
      }
    }

    return true;
  }

  virtual ProcInThread *createProcess(const LString &path,
                                      const LString &args,
				      const LString &wdir)
  {
    std::vector<LString> vargs;
    if (!parseCmdLine(args, vargs)) {
      LOG_DPRINTLN("PosixProc: cmdline error: "+args);
      return NULL;
    }      

    /////                                                                                                              
    int res;
    int ifd[2];
    pid_t pid;

    if (pipe(ifd) < 0) {
      LOG_DPRINTLN("PosixProc: cannot create pipe");
      return NULL;
    }

    /////                                                                                                              
    posix_spawn_file_actions_t actions;
    bool action_init = false;
    pid_t child;

    const char *prog_path = path.c_str();
    // char *const prog_argv[] = {(char *)prog_path, (char*)"-la", NULL};
    int nargs = vargs.size();
    const char **prog_argv = new const char *[nargs+2];
    prog_argv[0] = prog_path;
    for (int i=0; i<nargs; ++i) {
      prog_argv[i+1] = vargs[i].c_str();
    }
    prog_argv[nargs+1] = NULL;

    char *cur_wdir = NULL;

    try {
      res = posix_spawn_file_actions_init(&actions);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: cannot create posix_spawn_file_actions");
	return NULL;
      }
      action_init = true;

      res = posix_spawn_file_actions_adddup2(&actions, ifd[1], STDOUT_FILENO);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawn_file_actions_adddup2 (stdout) failed");
	return NULL;
      }

      res = posix_spawn_file_actions_adddup2(&actions, ifd[1], STDERR_FILENO);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawn_file_actions_adddup2 (stderr) failed");
	return NULL;
      }

      res = posix_spawn_file_actions_addclose(&actions, ifd[0]);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawn_file_actions_addclose(0) failed");
	return NULL;
      }

      res = posix_spawn_file_actions_addclose(&actions, ifd[1]);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawn_file_actions_addclose(1) failed");
	return NULL;
      }

      res = posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawn_file_actions_addopen(/dev/null) failed");
	return NULL;
      }
      
      if (wdir.length()>0) {
	cur_wdir = getcwd(NULL, 0);
	chdir(wdir.c_str());
	MB_DPRINTLN("PosixProc: wdir is changed to %s", wdir.c_str());
      }

      //res = posix_spawnp(&child, prog_path, &actions, NULL, (char*const*)prog_argv, NULL);
      res = posix_spawnp(&child, prog_path, &actions, NULL, (char*const*)prog_argv, environ);
      if (res != 0) {
	MB_THROW(RuntimeException, "PosixProc: posix_spawnp failed");
	return NULL;
      }

      if (cur_wdir!=NULL) {
	MB_DPRINTLN("PosixProc: wdir is returned to %s", cur_wdir);
	chdir(cur_wdir);
	free(cur_wdir);
	cur_wdir = NULL;
      }

      MB_DPRINTLN("posix_spawn: %d", res);
      MB_DPRINTLN("child pid: %d", int(child));
    }
    catch (...) {
      // Error --> perform cleaning up
      if (action_init)
	posix_spawn_file_actions_destroy(&actions);
      close(ifd[1]);
      close(ifd[0]);

      if (cur_wdir!=NULL) {
	chdir(cur_wdir);
	free(cur_wdir);
	cur_wdir = NULL;
      }

      throw;
    }
    
    if (action_init)
      posix_spawn_file_actions_destroy(&actions);

    // Close our writing end of pipe now. Otherwise later read would not
    // be able to detect end of child's output (in theory we could still
    // write to the pipe).
    close(ifd[1]);
    
    PosixInThread *pData = MB_NEW PosixInThread();
    pData->m_childpid = child;
    pData->m_infd = ifd[0];
    return pData;
  }

  virtual void kill(ProcInThread *pAData)
  {
    PosixInThread *pData = (PosixInThread *) pAData;
    pid_t childpid = pData->m_childpid;

    bool result = ::kill(childpid, SIGTERM) == 0;

    //if (result && wait) {
    if (result) {
      int tries = 60;
      // The process may not end immediately due to pending I/O
      while (tries-- > 0) {
	int pid = HANDLE_EINTR( ::waitpid(childpid, NULL, WNOHANG) );
	if (pid == childpid)
	  break;

	sleep(1);
      }

      result = ::kill(childpid, SIGKILL) == 0;
    }

    if (!result)
      LOG_DPRINTLN("Unable to terminate process.");
  }

};

}
