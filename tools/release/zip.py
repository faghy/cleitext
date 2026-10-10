"""Zips a folder keeping Unix permissions and symbolic links (python3 zip.py <out.zip> <folder>).

`zip -r` is not installed everywhere; Python is. Run from the folder's parent.
"""
import os
import stat
import sys
import zipfile

out, top = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for folder, dirs, files in os.walk(top):
        dirs.sort()
        for name in sorted(dirs) + sorted(files):
            path = os.path.join(folder, name)
            st = os.lstat(path)
            info = zipfile.ZipInfo.from_file(path, path)
            info.create_system = 3  # Unix: the mode below is read by unzip and file managers
            info.external_attr = (st.st_mode & 0xFFFF) << 16
            if stat.S_ISLNK(st.st_mode):
                archive.writestr(info, os.readlink(path))
            elif stat.S_ISDIR(st.st_mode):
                archive.writestr(info, b'')
            else:
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(path, 'rb') as source:
                    archive.writestr(info, source.read())
