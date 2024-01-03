import shutil
import argparse
import subprocess
import os
import re

OTOOL = "otool"
NAMETOOL = "install_name_tool"
sys_paths = ["/lib/", "/usr/lib/", "/System/Library"]

def get_deplibs(filename):
    otool_out = subprocess.check_output([OTOOL, '-L', filename])

    print "Filename: %s" % filename
    result = []
    for line in otool_out.splitlines():
        if line.find(filename) >= 0:
            continue
        m = re.match(r"\s+(\S+)\s+\(", line)
        assert m is not None
        line = m.group(1)
        # # line = line.split(" (")[0]
        # fname = os.path.basename(line)
        # print "%s --> %s" % (line, fname)
        if os.path.basename(line) == os.path.basename(filename):
            print "(%s ignored)" % line
            continue

        # print line
        result.append(line)
    return result


def is_system_lib(libpath):
    for i in sys_paths:
        if libpath.startswith(i):
            return True
    return False


def parse_search_path(arg):
    if arg is None:
        return []
    else:
        return arg.split(":")


def find_lib(libpath, search_path):
    if os.path.isabs(libpath):
        return libpath
    for i in search_path:
        bn = os.path.basename(libpath)
        chkpath = os.path.join(i, bn)
        if os.path.isfile(chkpath):
            return chkpath

    msg = "lib %s not found (error)" % libpath
    print msg
    raise IOError(msg)


def traverse_deplibs(cur_libpath, search_path):
    deplibs = get_deplibs(cur_libpath)
    abs_dep_list = []
    rewrite_names = []
    for dep_path in deplibs:
        if is_system_lib(dep_path):
            print "%s is system lib --> skip" % dep_path
            continue
        if dep_path.startswith("@executable_path/"):
            print "%s has @executable_path --> skip" % dep_path
            continue

        abs_dep_path = find_lib(dep_path, search_path)
        # print abs_dep_path
        abs_dep_list.append(abs_dep_path)
        bn = os.path.basename(dep_path)
        rewrite_names.append((dep_path, os.path.join("@executable_path", bn)))

    rewr_dict = {cur_libpath: rewrite_names}

    for abs_lib_path in abs_dep_list:
        ch_rewr_dict = traverse_deplibs(abs_lib_path, search_path)
        rewr_dict.update(ch_rewr_dict)

    return rewr_dict


def create_argparser():
    parser = argparse.ArgumentParser()

    parser.add_argument("-i", "--input_path", type=str, default=None)
    parser.add_argument("-o", "--out_dir", type=str, default=None)
    parser.add_argument("--search_path", type=str, default=None)
    
    args = parser.parse_args()
    return args


def copy_dylibs(rewr_dict, out_dir, nocopy):
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
        
    for k in sorted(rewr_dict.keys()):
        # print "%s: %s" % (k, rewr_dict[k])
        if k in nocopy:
            print "nocopy %s" % k
            dest_path = k
        else:
            shutil.copy2(k, out_dir)
            dest_path = os.path.join(out_dir, os.path.basename(k))
            print "installed %s --> %s" % (k, dest_path)

        for names in rewr_dict[k]:
            orig_nm, dest_nm = names
            subprocess.check_call([NAMETOOL,
                                   '-change',
                                   orig_nm,
                                   dest_nm,
                                   dest_path,
                                   ])
            print "rewrite %s: %s --> %s" % (dest_path, orig_nm, dest_nm)

def main():
    args = create_argparser()
    root_pathname = args.input_path
    search_path = parse_search_path(args.search_path)
    print "search path: %s" % search_path
    rewr = traverse_deplibs(root_pathname, search_path)
    for k in sorted(rewr.keys()):
        print "%s: %s" % (k, rewr[k])
    
    copy_dylibs(rewr, args.out_dir, nocopy=[root_pathname])

if __name__ == "__main__":
    main()
    
