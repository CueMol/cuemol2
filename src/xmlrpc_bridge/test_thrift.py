#!/usr/bin/env python

import qm_thrift


qm_thrift.init(9090, "xxx")

def test1():
  obj = qm_thrift.createObj("Vector")
  print "v.x =  ", obj.x;
  print "v.x =  ", obj.x;
  

test1()

#except AuthException, io:
#  print 'AuthException: %r' % io

#except Thrift.TException, tx:
#  print '%s' % (tx.message)
