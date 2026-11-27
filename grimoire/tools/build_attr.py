# -*- coding: utf-8 -*-
"""纯属性标签源：头发 / 眼睛 / 体型（无图，文字卡片）+ 人像（Portrait Gallery 参考图）。

属性标签做不了「配图」——同名标签对应的图就是角色全身图，会误导（用户实测发现过）。
所以这类源 image_url 留空，前端渲染成文字卡片；频次（p）当热度排序。
"""
import json, collections, os
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

DATA = OUT_DIR
# ⚠️ 按你的机器改：ComfyUI 的 custom_nodes 目录
CN = '/data/Aiwork/ComfyUI/ComfyUI-master/custom_nodes'
chars = json.load(open(os.path.join(DATA, 'characters.json'), encoding='utf-8'))

# 归一化下划线变体（blue_eyes → blue eyes），合并计数
count = collections.Counter()
for it in chars:
    for tag in (it.get('tl') or []):
        count[tag.replace('_', ' ').strip()] += 1


def build(keys, exclude, min_count, cn_map, cat):
    rows = []
    for tag, hits in count.items():
        low = tag.lower()
        if not any(k in low for k in keys):
            continue
        if exclude and any(k in low for k in exclude):
            continue
        if hits < min_count:
            continue
        rows.append({
            'n': tag,
            'cn': cn_map.get(low, tag),
            't': tag,
            'kw': cn_map.get(low, ''),
            'c': cat, 'cc': cat,
            'p': hits, 'f': 0,
            'i': '',            # 属性标签不配图
        })
    rows.sort(key=lambda r: -r['p'])
    return rows


HAIR_CN = {
    'long hair': '长发', 'short hair': '短发', 'very long hair': '超长发', 'medium hair': '中长发',
    'absurdly long hair': '极长发', 'twintails': '双马尾', 'ponytail': '马尾', 'side ponytail': '侧马尾',
    'low twintails': '低双马尾', 'short twintails': '短双马尾', 'high ponytail': '高马尾',
    'ahoge': '呆毛', 'sidelocks': '鬓发', 'hair between eyes': '眼前发', 'hair over one eye': '遮眼发',
    'bangs': '刘海', 'blunt bangs': '齐刘海', 'swept bangs': '侧分刘海', 'parted bangs': '中分刘海',
    'crossed bangs': '交叉刘海', 'hair intakes': '内卷发', 'hair flaps': '发片',
    'curly hair': '卷发', 'wavy hair': '波浪发', 'straight hair': '直发', 'messy hair': '乱发',
    'spiked hair': '刺发', 'flipped hair': '外翻发', 'bob cut': '波波头', 'hime cut': '姬发式',
    'braid': '编发', 'single braid': '单侧编发', 'twin braids': '双编发', 'french braid': '法式编发',
    'drill hair': '钻头卷', 'hair bun': '丸子头', 'double bun': '双丸子头', 'hair up': '盘发',
    'hair ribbon': '发带', 'hair bow': '蝴蝶结发饰', 'hairclip': '发夹', 'hairband': '发箍',
    'hair ornament': '发饰', 'hair flower': '发花', 'hair stick': '发簪',
    'two-tone hair': '双色发', 'streaked hair': '挑染', 'gradient hair': '渐变发',
    'multicolored hair': '多色发', 'colored inner hair': '内层挑染', 'split-color hair': '分色发',
    'shiny hair': '亮泽发', 'fluffy hair': '蓬松发', 'wet hair': '湿发', 'big hair': '蓬松大卷',
    'black hair': '黑发', 'brown hair': '棕发', 'blonde hair': '金发', 'white hair': '白发',
    'blue hair': '蓝发', 'grey hair': '灰发', 'pink hair': '粉发', 'purple hair': '紫发',
    'red hair': '红发', 'green hair': '绿发', 'orange hair': '橙发', 'silver hair': '银发',
    'aqua hair': '水色发', 'navy hair': '深蓝发', 'hair behind ear': '耳后发',
    'hair spread out': '散发', 'hair pulled back': '后梳发',
}
EYE_CN = {
    'blue eyes': '蓝眼', 'red eyes': '红眼', 'brown eyes': '棕眼', 'green eyes': '绿眼',
    'purple eyes': '紫眼', 'yellow eyes': '黄眼', 'pink eyes': '粉眼', 'black eyes': '黑眼',
    'grey eyes': '灰眼', 'orange eyes': '橙眼', 'aqua eyes': '水色眼', 'gold eyes': '金眼',
    'heterochromia': '异色瞳', 'eyelashes': '睫毛', 'thick eyebrows': '浓眉',
    'slit pupils': '竖瞳', 'heart-shaped pupils': '心形瞳', 'glowing eyes': '发光的眼',
    'mole under eye': '眼下泪痣', 'one eye closed': '单眼闭合', 'empty eyes': '空洞的眼神',
    'tareme': '下垂眼', 'tsurime': '上挑眼', 'half-closed eyes': '半睁眼',
}
BODY_CN = {
    'large breasts': '巨乳', 'medium breasts': '中等胸', 'small breasts': '小胸',
    'huge breasts': '超大胸', 'breasts': '胸部', 'thighs': '大腿', 'thick thighs': '粗大腿',
    'muscular': '肌肉', 'muscular male': '肌肉男', 'muscular female': '肌肉女',
    'abs': '腹肌', 'slim': '苗条', 'curvy': '曲线', 'wide hips': '宽胯',
    'tall': '高个', 'short stature': '矮个', 'chubby': '微胖', 'thigh gap': '大腿缝',
}

hair = build(('hair', 'braid', 'ponytail', 'twintails', 'bangs', 'ahoge', 'bob cut', 'bun',
              'hime cut', 'drill', 'sidelocks', 'hairband'), (), 30, HAIR_CN, '头发')
eyes = build(('eye', 'pupil', 'heterochromia'), ('hair',), 30, EYE_CN, '眼睛')
body = build(('breast', 'thigh', 'hips', 'waist', 'muscular', 'slim', 'curvy', 'stature', 'abs', 'chubby'),
             ('thighhigh', 'thigh strap', 'thigh boots', 'thigh belt', 'thighlet', 'waist apron', 'waist cape',
              'waist skirt', 'hips', 'breastplate', 'breast pocket', 'breast curtain', 'hands on own'), 30, BODY_CN, '体型')

for name, rows in (('hair', hair), ('eyes', eyes), ('body', body)):
    json.dump(rows, open(os.path.join(DATA, name + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print('%-6s %3d 条 | 中文 %2d | %s' % (name, len(rows), sum(1 for r in rows if r['cn'] != r['n']),
          ', '.join(r['cn'] for r in rows[:5])))

# ---------- 人像（Portrait Gallery：脸型 / 造型参考） ----------
pt = json.load(open(os.path.join(CN, 'comfyui-portrait-gallery/library/data/portrait.json'), encoding='utf-8'))
HAIR = {'ショート': ('short hair', '短发'), 'ミディアム': ('medium hair', '中长发'),
        'セミロング': ('semi-long hair', '半长发'), 'ロング': ('long hair', '长发')}
SECTION = {'face': ('face', '脸部'), 'styling': ('styling', '造型')}
rows = []
for r in pt:
    pid = r.get('id') or ''
    if not pid:
        continue
    hair_en, hair_cn = HAIR.get(r.get('hair'), ('', ''))
    sec_en, sec_cn = SECTION.get(r.get('section'), ('', r.get('section') or ''))
    rows.append({
        'n': pid,
        'cn': ' '.join(x for x in (hair_cn, sec_cn) if x) or pid,
        't': ' '.join(x for x in (hair_en, sec_en) if x),
        'kw': ' '.join(x for x in (hair_cn, hair_en, sec_cn, r.get('style') or '') if x),
        'c': sec_cn or '未分类', 'cc': sec_cn or '未分类',
        'p': (r.get('w') or 0) * (r.get('h') or 0) // 1000, 'f': 0,
        'i': "/portrait_gallery/assets/thumb/%s.webp" % pid,
        'v': "/portrait_gallery/assets/img/full/%s.png" % pid,
    })
rows.sort(key=lambda x: (-x['p'], x['n']))
json.dump(rows, open(os.path.join(DATA, 'portrait.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('portrait %d 条 | %d bytes | 分类: %s' % (len(rows), os.path.getsize(os.path.join(DATA, 'portrait.json')),
      dict(collections.Counter(r['c'] for r in rows))))
