# -*- coding: utf-8 -*-
"""姿势库 → 魔导书数据源（动作描述用官方 labels-en 翻译，与节点输出口径一致）。"""
import json, re, os
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

# ⚠️ 按你的机器改：ComfyUI 的 custom_nodes 目录
CN = '/data/Aiwork/ComfyUI/ComfyUI-master/custom_nodes'
PG = os.path.join(CN, 'comfyui-pose-gallery')
OUT = OUT_DIR

rows = json.load(open(os.path.join(PG, 'library/data/pose-zh.json'), encoding='utf-8'))
labels = json.load(open(os.path.join(PG, 'web/labels-en.json'), encoding='utf-8'))


def en(value):
    return labels.get(value, value)


def action_of(row):
    """完全照 catalog.pose_action(language='en') 的口径。"""
    name = row.get('name_en') or labels.get(row.get('姿势名称', ''), row.get('姿势名称', ''))
    parts = [p.strip() for p in re.split(r'[·・]', name) if p.strip()]
    return ', '.join(parts)


ANGLE_EN = {
    '正面': 'from front',
    '侧面': 'from side',
    '斜侧': 'three-quarter view',
    '俯视': 'from above',
    '仰视': 'from below',
}

poses = []
for row in rows:
    pid = row.get('id') or ''
    if not pid:
        continue
    act = action_of(row)
    if not act:
        continue
    angle = row.get('角度') or ''
    angle_en = ANGLE_EN.get(angle, '')
    if angle_en:
        act = f"{act}, {angle_en}"''
    cat = row.get('分类') or ''
    system = row.get('体系') or ''
    poses.append({
        'n': f"{row.get('姿势编号') or pid}{' ' + angle if angle else ''}",
        'cn': f"{row.get('姿势名称') or ''}{'・' + angle if angle else ''}",
        't': act,
        'kw': ' '.join(x for x in (system, cat, angle, row.get('姿势编号') or '', act) if x),
        'c': cat, 'cc': cat,
        'p': 0, 'f': 0,
        'i': f"/pose_gallery/assets/thumbs/{pid}.jpg",
        'v': f"/pose_gallery/assets/img/{pid}.png",
        'tl': [en(a) for a in (system, angle) if a],
    })

poses.sort(key=lambda r: (r['c'], r['n']))
json.dump(poses, open(os.path.join(OUT, 'pose.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('pose:', len(poses), '| 文件', os.path.getsize(os.path.join(OUT, 'pose.json')), 'bytes')
from collections import Counter
print('分类分布:', dict(Counter(r['c'] for r in poses)))
print('样例3:')
for r in poses[:3]:
    print('  ', r['n'], '|', r['cn'], '|', r['t'], '|', r['c'])
