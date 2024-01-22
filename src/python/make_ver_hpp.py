import argparse
import re
import subprocess
from pathlib import Path


def create_argparser():
    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--input_path", type=str, default=None, required=True)
    parser.add_argument("-o", "--output_path", type=str, default=None)
    args = parser.parse_args()
    return args


def get_git_hash():
    path = Path(__file__)
    path = path.parent
    cmd = ["git", "-C", path, "rev-parse", "--short", "HEAD"]
    print(f"{cmd=}")
    commit_hash = subprocess.check_output(cmd)
    commit_hash = commit_hash.decode('utf-8').strip()
    return commit_hash


def create_ver_hpp(ver_maj, ver_min, ver_rev, ver_build):
    template = """//
// Version info
//

#define FILEVER       {v1},{v2},{v3},{v4}
#define PRODUCTVER    {v1},{v2},{v3},{v4}
#define STRFILEVER    "{v1}.{v2}.{v3}.{v4}"
#define STRPRODUCTVER "{v1}.{v2}.{v3}.{v4}"
#define BUILD_ID {v5}
#define STRBUILD_ID "{v5}"

#define QUE_VERSION_STRING "Version " STRPRODUCTVER " build " STRBUILD_ID
"""

    build_id = get_git_hash()

    template = template.format(v1=ver_maj,
                               v2=ver_min,
                               v3=ver_rev,
                               v4=ver_build,
                               v5=build_id)
    print(template)
    return template

def main():
    args = create_argparser()
    with open(args.input_path) as f:
        dat = f.readlines()
    ver_maj, ver_min, ver_rev, ver_build = (None, None, None, None)
    for line in dat:
        m = re.search(r"QM_VERSION\s+\"(\d+)\.(\d+)\.(\d+)\.(\d+)\"", line)
        if m is None:
            continue
        print(m.group(1), m.group(2), m.group(3), m.group(4))
        ver_maj = int(m.group(1))
        ver_min = int(m.group(2))
        ver_rev = int(m.group(3))
        ver_build = int(m.group(4))
    
    str_ver_hpp = create_ver_hpp(ver_maj, ver_min, ver_rev, ver_build)
    if args.output_path is None:
        return

    with open(args.output_path, "w") as f:
        f.write(str_ver_hpp)

if __name__ == "__main__":
    main()
