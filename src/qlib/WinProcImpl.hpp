//
// Win32 thread/process manager implementation
//

namespace qlib {

class WinInThread : public ProcInThread
{
public:

  HANDLE m_procHandle;
  HANDLE m_inHandle;

  virtual void run()
  {
    // Read output from the child process's pipe for STDOUT
    const int kBufferSize = 1024;
    char buffer[kBufferSize];

    for (;;) {
      DWORD bytes_read = 0;
      BOOL success = ::ReadFile(m_inHandle, buffer, kBufferSize-1, &bytes_read, NULL);
      if (!success || bytes_read == 0)
        break;
      buffer[bytes_read] = '\0';
      // m_sbuf.append(buffer);

      {
	boost::mutex::scoped_lock lck(m_lock);
	m_sbuf.append(buffer);
      }
    }

    // Let's wait for the process to finish.
    ::WaitForSingleObject(m_procHandle, INFINITE);
    DWORD exitcode;
    ::GetExitCodeProcess(m_procHandle, &exitcode);
    ::CloseHandle(m_procHandle);
    m_nExitCode = exitcode;
  }
};

class WinProcMgrImpl : public LProcMgrImpl
{
public:
  virtual int getCPUCount() const
  {
    SYSTEM_INFO siSysInfo;
    ::GetSystemInfo(&siSysInfo);
    return siSysInfo.dwNumberOfProcessors;
  }

  virtual ProcInThread *createProcess(const LString &path,
                                      const LString &args,
                                      const LString &wdir)
  {
    HANDLE out_read = NULL;
    HANDLE out_write = NULL;

    SECURITY_ATTRIBUTES sa_attr;
    // Set the bInheritHandle flag so pipe handles are inherited.
    sa_attr.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa_attr.bInheritHandle = TRUE;
    sa_attr.lpSecurityDescriptor = NULL;

    // Create the pipe for the child process's STDOUT.
    if (!::CreatePipe(&out_read, &out_write, &sa_attr, 0)) {
      MB_THROW(RuntimeException, "CreatePipe failed");
      return NULL;
    }

    // Ensure the read handle to the pipe for STDOUT is not inherited.
    if (!::SetHandleInformation(out_read, HANDLE_FLAG_INHERIT, 0)) {
      ::CloseHandle(out_read);
      ::CloseHandle(out_write);
      MB_THROW(RuntimeException, "SetHandleInformation failed");
      return NULL;
    }

    LString nargs = "\"" + path + "\" " + args;
    wchar_t *pwcsCmdLine;
    // This possibly throws exception ...
    pwcsCmdLine = (wchar_t *)qlib::UTF8toUCS16(nargs);

    // Now create the child process
    PROCESS_INFORMATION proc_info = { 0 };
    STARTUPINFO start_info = { 0 };

    start_info.cb = sizeof(STARTUPINFO);
    start_info.hStdOutput = out_write;
    // Keep the normal stdin and stderr.
    start_info.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    start_info.hStdError = out_write; //GetStdHandle(STD_ERROR_HANDLE);
    start_info.dwFlags |= (STARTF_USESTDHANDLES|STARTF_USESHOWWINDOW);
    start_info.wShowWindow = SW_HIDE;

    BOOL res = ::CreateProcess(NULL, pwcsCmdLine,
                               NULL, NULL,
                               TRUE,
                               0, NULL, NULL,
                               &start_info, &proc_info);

    delete [] pwcsCmdLine;

    if (!res) {
      // cannot create process (error)
      ::CloseHandle(out_read);
      ::CloseHandle(out_write);
      LString msg = LString::format("FATAL ERROR, cannot create process: %s", nargs.c_str());
      MB_THROW(RuntimeException, msg);
      return NULL;
    }
    
    // We don't need the thread handle, close it now.
    ::CloseHandle(proc_info.hThread);
    ::CloseHandle(out_write);

    WinInThread *pData = MB_NEW WinInThread();
    pData->m_procHandle = proc_info.hProcess;
    pData->m_inHandle = out_read;
    pData->m_nExitCode = 0;

    return pData;
  }

  virtual void kill(ProcInThread *pAData)
  {
    WinInThread *pData = (WinInThread *) pAData;
    HANDLE hproc = pData->m_procHandle;
    ::TerminateProcess(hproc, 0);
  }

};

} // namespace qlib

