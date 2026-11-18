"""BlackRin 跨系统路径兼容：让 ComfyUI 同时接受 / 和 \\ 模型路径。
在节点包导入时挂到 folder_paths 上，不改 ComfyUI 核心文件，升级不会丢。
"""
import os
import folder_paths


def install():
    if getattr(folder_paths, "_blackrin_pathsep", False):
        return
    orig_list = folder_paths.get_filename_list
    orig_full = folder_paths.get_full_path

    def get_filename_list(folder_name):
        names = list(orig_list(folder_name))
        if os.sep == "/":
            extra = [n.replace("/", "\\") for n in names if "/" in n]
        else:
            extra = [n.replace("\\", "/") for n in names if "\\" in n]
        seen = set(names)
        return names + [x for x in extra if x not in seen]

    def get_full_path(folder_name, filename):
        if filename:
            filename = filename.replace("\\", os.sep).replace("/", os.sep)
        return orig_full(folder_name, filename)

    folder_paths.get_filename_list = get_filename_list
    folder_paths.get_full_path = get_full_path
    folder_paths._blackrin_pathsep = True
    print("[BlackRin] path compat installed")
