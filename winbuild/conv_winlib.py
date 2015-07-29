#!/usr/bin/python

import sys

rwrite = [("FAILIFMISMATCH:\"_ITERATOR_DEBUG_LEVEL=0\"","FAILIFMISMATCH:\"_JTERATOR_DEBUG_LEVEL=0\""),
          ("FAILIFMISMATCH:\"RuntimeLibrary=MD_DynamicRelease\"","FAILIFMISMATCH:\"SuntimeLibrary=MD_DynamicRelease\"")]

print sys.argv[1]
infile = sys.argv[1]
outfile = sys.argv[2]

f = open(infile, 'rb')

buf = f.read()
f.close()

len = len(buf)
print "file length: "+str(len)

for (rwf, rwt) in rwrite:
    print "Rewriting ["+rwf+"] --> ["+rwt+"]"
    print "Occurence of ["+rwf+"]="+str(buf.count(rwf))
    res = buf.replace(rwf, rwt)
    buf = res

print
print "Writing out file="+outfile
f = open(outfile, 'wb')
f.write(buf)
f.close()

