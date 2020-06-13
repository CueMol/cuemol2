#!/bin/sh

echo 'r\nc' > lldb_cmd.txt
echo 'bt\nquit' > lldb_kill.batch

lldb --batch -s lldb_cmd.txt -K lldb_kill.batch -f python3 -- -c "import cuemol"
