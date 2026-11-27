# -*- coding: utf-8 -*-
"""把服装/人像图库的「图 + 标签」抽成 BlackRin 魔导书的数据源。"""
import json, collections, os
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

# ⚠️ 按你的机器改：ComfyUI 的 custom_nodes 目录
CN = '/data/Aiwork/ComfyUI/ComfyUI-master/custom_nodes'
OUT = OUT_DIR

# ---------- 服装 ----------
src = json.load(open(os.path.join(CN, 'comfyui-costume-gallery/library/data/costume-zh.json'), encoding='utf-8'))
costumes = []
for row in src:
    cid = row.get('id') or ''
    kw_cn = row.get('关键词') or []
    kw_en = (row.get('英文关键词') or '').strip()
    if not cid or not kw_en:
        continue
    cat = row.get('分类') or ''
    costumes.append({
        'n': cid,
        'cn': '・'.join(kw_cn[:3]) if kw_cn else cat,
        't': kw_en,
        'kw': ' '.join(kw_cn),
        'c': cat, 'cc': cat,
        'p': 0, 'f': 0,
        'i': '/costume_gallery/assets/thumbs/%s.webp' % cid,
        'v': '/costume_gallery/assets/img/%s.webp' % cid,
        'tl': kw_cn,
    })
costumes.sort(key=lambda r: (r['c'], r['n']))
json.dump(costumes, open(os.path.join(OUT, 'costume.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('costume:', len(costumes), '分类:', dict(collections.Counter(r['c'] for r in costumes)))

# ---------- 头发（人像库的 hair 分类 → 标签） ----------
pt = json.load(open(os.path.join(CN, 'comfyui-portrait-gallery/library/data/portrait.json'), encoding='utf-8'))
HAIR = {
    'ショート': ('short hair', '短发'),
    'ミディアム': ('medium hair', '中长发'),
    'セミロング': ('semi-long hair', '半长发'),
    'ロング': ('long hair', '长发'),
}
bucket = collections.defaultdict(list)
for row in pt:
    hair = row.get('hair')
    if hair in HAIR:
        bucket[hair].append(row)
hairs = []
for jp, (en, cn) in HAIR.items():
    rows = sorted(bucket.get(jp, []), key=lambda r: r.get('w', 0) * r.get('h', 0), reverse=True)
    if not rows:
        continue
    rep = rows[0]
    hairs.append({
        'n': en, 'cn': cn, 't': en, 'kw': cn,
        'c': '头发', 'cc': '头发',
        'p': len(rows), 'f': 0,
        'i': '/portrait_gallery/assets/thumb/%s.webp' % rep['id'],
        'v': '/portrait_gallery/assets/img/full/%s.png' % rep['id'],
        'tl': [cn],
    })
json.dump(hairs, open(os.path.join(OUT, 'hair.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('hair:', len(hairs), [(h['n'], h['p']) for h in hairs])
for name in ('costume.json', 'hair.json'):
    p = os.path.join(OUT, name)
    print(name, os.path.getsize(p), 'bytes')
