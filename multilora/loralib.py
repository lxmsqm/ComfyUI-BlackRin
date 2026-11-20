#!/usr/bin/env python3
"""
loralib.py - ComfyUI 多 LoRA 加载器核心逻辑层

本模块提供 LoRA 扫描、预设管理、触发词拼接等功能，
不依赖 ComfyUI，可独立 import 和单测。
"""

import hashlib
import json
import os
import tempfile
from pathlib import Path

# LoRA 文件扩展名
LORA_EXTENSIONS = {".safetensors", ".pt", ".ckpt", ".bin"}

# 预览文件扩展名及优先级
PREVIEW_EXTENSIONS = [".jpeg", ".jpg", ".png", ".webp", ".mp4", ".webm"]
IMAGE_EXTENSIONS = {".jpeg", ".jpg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm"}


def _is_valid_path(path):
    """检查路径是否合法（非 None、非空、字符串或 Path 对象）"""
    if path is None:
        return False
    if isinstance(path, (str, Path)):
        return len(str(path)) > 0
    return False


def _safe_read_json(path):
    """安全读取 JSON 文件，失败返回 None"""
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None


_HASH_CACHE = {}


def file_sha256(path) -> str:
    """算文件 sha256（按 路径+mtime+size 缓存，避免重复扫几百 MB）"""
    try:
        st = os.stat(path)
    except OSError:
        return ""
    key = (str(path), st.st_mtime, st.st_size)
    cached = _HASH_CACHE.get(str(path))
    if cached and cached[0] == key:
        return cached[1]
    sha = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                sha.update(chunk)
    except OSError:
        return ""
    digest = sha.hexdigest()
    _HASH_CACHE[str(path)] = (key, digest)
    return digest


def _build_hash_index(scan_root: Path) -> dict:
    """
    扫描目录下所有 *.metadata.json，建 sha256 -> 预览/metadata 的索引。
    用途：LoRA 文件被改名后，同名预览找不到，但内容 sha256 没变，
         就能靠这份索引把预览图（和触发词/base_model）认回来。
    """
    index = {}
    try:
        meta_files = list(scan_root.rglob("*.metadata.json"))
    except OSError:
        return index

    for meta_file in meta_files:
        rel_parts = meta_file.relative_to(scan_root).parts
        if any(part.startswith(".") for part in rel_parts):
            continue
        meta = _safe_read_json(meta_file)
        if not isinstance(meta, dict):
            continue
        sha = str(meta.get("sha256") or "").strip().lower()
        if not sha:
            continue

        preview_path = ""
        recorded = meta.get("preview_url") or ""
        if isinstance(recorded, str) and recorded:
            cand = recorded
            if not os.path.isabs(cand):
                cand = os.path.join(str(meta_file.parent), cand)
            if os.path.isfile(cand):
                preview_path = cand
        if not preview_path:
            stem = meta_file.name[: -len(".metadata.json")]
            for ext in PREVIEW_EXTENSIONS:
                cand = meta_file.parent / (stem + ext)
                if cand.exists():
                    preview_path = str(cand)
                    break

        if preview_path:
            index.setdefault(sha, {"preview_abs": preview_path, "metadata": meta})
    return index


def _preview_type_of(path: str) -> str:
    lower = path.lower()
    if lower.endswith((".mp4", ".webm", ".mov")):
        return "video"
    return "image"


def _find_preview(lora_path: Path) -> tuple:
    """
    查找 LoRA 对应的预览文件
    返回 (preview_abs_path, preview_type) 或 (None, None)
    """
    stem = lora_path.stem
    parent = lora_path.parent
    
    for ext in PREVIEW_EXTENSIONS:
        preview_path = parent / f"{stem}{ext}"
        if preview_path.exists():
            if ext in IMAGE_EXTENSIONS:
                return str(preview_path), "image"
            elif ext in VIDEO_EXTENSIONS:
                return str(preview_path), "video"
    
    return None, None


def _load_metadata(lora_path: Path) -> dict:
    """
    加载 LoRA 的 metadata 文件
    返回解析后的字典，失败返回空字典
    """
    metadata_path = lora_path.parent / f"{lora_path.stem}.metadata.json"
    data = _safe_read_json(metadata_path)
    if data is None or not isinstance(data, dict):
        return {}
    return data


def scan_loras(root) -> list:
    """
    递归扫描 root 下所有 LoRA 文件

    Args:
        root: LoRA 根目录路径；也可以是路径列表（多个模型目录时按顺序合并，同名去重）

    Returns:
        包含 LoRA 信息的字典列表，按 name 排序
    """
    # 多根目录：逐个扫描后合并（同名/同路径去重，先出现的优先）
    if isinstance(root, (list, tuple, set)):
        merged = []
        seen_names = set()
        seen_paths = set()
        for single in root:
            for item in scan_loras(single):
                key_path = os.path.normcase(item.get("abs_path", ""))
                if key_path in seen_paths:
                    continue
                seen_paths.add(key_path)
                if item.get("name") in seen_names:
                    continue
                seen_names.add(item.get("name"))
                merged.append(item)
        merged.sort(key=lambda x: x.get("name", ""))
        return merged

    # 参数校验
    if not _is_valid_path(root):
        return []
    
    root_path = Path(root)
    
    # 目录不存在或不是目录
    if not root_path.exists() or not root_path.is_dir():
        return []
    
    results = []
    
    try:
        # 遍历所有文件
        for file_path in root_path.rglob("*"):
            # 跳过隐藏目录（以 . 开头的目录）
            # 检查相对路径中是否包含以 . 开头的部分
            rel_parts = file_path.relative_to(root_path).parts
            if any(part.startswith(".") for part in rel_parts):
                continue
            
            # 只处理文件
            if not file_path.is_file():
                continue
            
            # 检查是否是 LoRA 文件
            if file_path.suffix.lower() not in LORA_EXTENSIONS:
                continue
            
            # 计算相对路径（使用正斜杠）
            rel_path = file_path.relative_to(root_path).as_posix()
            name = str(file_path.relative_to(root_path).with_suffix(""))
            
            # 获取文件大小
            try:
                size = file_path.stat().st_size
            except OSError:
                size = 0
            
            # 查找预览文件
            preview, preview_type = _find_preview(file_path)
            
            # 加载 metadata
            metadata = _load_metadata(file_path)
            
            # 提取触发词
            triggers = []
            civitai_data = metadata.get("civitai")
            if isinstance(civitai_data, dict):
                trained_words = civitai_data.get("trainedWords")
                if isinstance(trained_words, list):
                    triggers = [str(w) for w in trained_words if w is not None]
            
            # civitai 的 model / version id（前端用来跳转 C 站网页）
            civitai_model_id = None
            civitai_version_id = None
            if isinstance(civitai_data, dict):
                civitai_version_id = civitai_data.get("id")
                civitai_model_id = civitai_data.get("modelId")
            if civitai_model_id is None:
                civitai_model_id = metadata.get("modelId")

            # 提取 base_model
            base_model = metadata.get("base_model", "")
            if not isinstance(base_model, str):
                base_model = str(base_model) if base_model is not None else ""
            
            # 提取 nsfw_level（没有 preview_nsfw_level 时退回 civitai.nsfwLevel）
            nsfw_level = metadata.get("preview_nsfw_level")
            if nsfw_level is None and isinstance(civitai_data, dict):
                nsfw_level = civitai_data.get("nsfwLevel")
            if nsfw_level is not None:
                try:
                    nsfw_level = int(nsfw_level)
                except (ValueError, TypeError):
                    nsfw_level = None
            
            results.append({
                "name": name,
                "rel_path": rel_path,
                "abs_path": str(file_path),
                "size": size,
                "preview": preview,
                "preview_abs": preview or "",
                "preview_type": preview_type,
                "triggers": triggers,
                "base_model": base_model,
                "nsfw_level": nsfw_level,
                "civitai_model_id": civitai_model_id,
                "civitai_version_id": civitai_version_id,
                "_metadata": metadata,   # 内部用，返回前会删掉
            })
    except OSError:
        # 遍历过程中发生 IO 错误，返回已收集的结果
        pass
    
    # ===== 改名兼容：同名预览找不到时，按 sha256 认回预览图 =====
    # 文件改名后 <新名>.jpeg 不存在，但 <旧名>.metadata.json 里记着 sha256 和 preview_url，
    # 用它建索引就能把预览、触发词、base_model 一起认回来。
    hash_index = None
    for item in results:
        if item.get("preview"):
            continue
        meta = item.get("_metadata") or {}
        sha = str(meta.get("sha256") or "").strip().lower()
        if not sha:
            sha = file_sha256(item["abs_path"])
        if not sha:
            continue
        if hash_index is None:
            hash_index = _build_hash_index(root_path)
        entry = hash_index.get(sha)
        if not entry:
            continue
        item["preview"] = entry["preview_abs"]
        item["preview_abs"] = entry["preview_abs"]
        item["preview_type"] = _preview_type_of(entry["preview_abs"])
        item["preview_source"] = "sha256"   # 标记：这张图是靠哈希认出来的
        old_meta = entry.get("metadata") or {}
        if not item.get("triggers"):
            civitai = old_meta.get("civitai")
            if isinstance(civitai, dict):
                words = civitai.get("trainedWords")
                if isinstance(words, list):
                    item["triggers"] = [str(w) for w in words if w is not None]
        if not item.get("base_model"):
            item["base_model"] = old_meta.get("base_model", "") or ""
        if not item.get("nsfw_level"):
            try:
                item["nsfw_level"] = int(old_meta.get("preview_nsfw_level") or 0)
            except (TypeError, ValueError):
                pass

    # 内部字段不外泄
    for item in results:
        item.pop("_metadata", None)

    # 按 name 排序
    results.sort(key=lambda x: x["name"])
    
    return results


def load_presets(path) -> dict:
    """
    读取预设文件
    
    Args:
        path: 预设文件路径
        
    Returns:
        {预设名: [条目, ...]} 字典，失败返回空字典
    """
    if not _is_valid_path(path):
        return {}
    
    path_str = str(path)
    if not os.path.exists(path_str):
        return {}
    
    data = _safe_read_json(path_str)
    if data is None or not isinstance(data, dict):
        return {}
    
    # 验证结构：每个值应该是列表
    result = {}
    for key, value in data.items():
        if isinstance(value, list):
            result[key] = value
    
    return result


def save_preset(path, name, items):
    """
    保存预设到文件
    
    Args:
        path: 预设文件路径
        name: 预设名称
        items: 预设条目列表
        
    Raises:
        ValueError: 当 name 或 items 非法时
    """
    # 参数校验
    if name is None or not isinstance(name, str) or len(name) == 0:
        raise ValueError("name 不能为 None 或空字符串")
    
    if items is None or not isinstance(items, list):
        raise ValueError("items 必须是非 None 的列表")
    
    if not _is_valid_path(path):
        raise ValueError("path 非法")
    
    path_str = str(path)
    
    # 读取现有预设
    existing = load_presets(path_str)
    
    # 更新预设
    existing[name] = items
    
    # 确保父目录存在
    parent_dir = os.path.dirname(path_str)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    
    # 原子写入：先写临时文件，再替换
    try:
        # 创建临时文件在同一目录
        fd, tmp_path = tempfile.mkstemp(dir=parent_dir if parent_dir else ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
            # 原子替换
            os.replace(tmp_path, path_str)
        except:
            # 清理临时文件
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise
    except OSError as e:
        raise OSError(f"保存预设失败: {e}")


def delete_preset(path, name) -> bool:
    """
    删除指定预设
    
    Args:
        path: 预设文件路径
        name: 预设名称
        
    Returns:
        成功返回 True，不存在返回 False
    """
    if not _is_valid_path(path) or name is None or not isinstance(name, str):
        return False
    
    path_str = str(path)
    
    # 文件不存在
    if not os.path.exists(path_str):
        return False
    
    # 读取现有预设
    existing = load_presets(path_str)
    
    # 预设不存在
    if name not in existing:
        return False
    
    # 删除预设
    del existing[name]
    
    # 保存回文件
    try:
        parent_dir = os.path.dirname(path_str)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        
        fd, tmp_path = tempfile.mkstemp(dir=parent_dir if parent_dir else ".", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, path_str)
        except:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise
        return True
    except OSError:
        return False


def build_trigger_text(loras) -> str:
    """
    从 LoRA 列表中构建触发词文本
    
    Args:
        loras: [{"name":..., "enabled": bool, "triggers": [str,...]}, ...]
        
    Returns:
        去重后的触发词，用 ", " 连接
    """
    if not loras or not isinstance(loras, list):
        return ""
    
    seen = set()
    triggers = []
    
    for item in loras:
        if not isinstance(item, dict):
            continue
        
        # 只处理 enabled=True 的条目
        if not item.get("enabled", False):
            continue
        
        item_triggers = item.get("triggers", [])
        if not isinstance(item_triggers, list):
            continue

        # 单条触发词的开关（前端下拉面板里的勾选状态）；没给状态就默认全开
        states = item.get("trigger_states")
        if not isinstance(states, list):
            states = []

        for idx, trigger in enumerate(item_triggers):
            if trigger is None:
                continue
            if idx < len(states) and states[idx] is False:
                continue   # 这一条被关掉了
            trigger_str = str(trigger).strip()
            if trigger_str and trigger_str not in seen:
                seen.add(trigger_str)
                triggers.append(trigger_str)
    
    return ", ".join(triggers)