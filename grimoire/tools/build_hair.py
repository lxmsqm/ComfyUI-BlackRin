# -*- coding: utf-8 -*-
"""从角色库的外观标签聚合出「头发」标签库。

原来那 4 条是从 portrait-gallery 的 hair 分类硬凑的（那个库其实是脸型/人像参考库），
这里改成从 35652 个角色的 tags_list 里按出现次数聚合，每个标签配一张代表角色缩略图。
"""
import json, collections, os
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

DATA = OUT_DIR
chars = json.load(open(os.path.join(DATA, 'characters.json'), encoding='utf-8'))

KEYS = ('hair', 'braid', 'ponytail', 'twintails', 'bangs', 'ahoge', 'bob cut', 'bun',
        'hime cut', 'drill', 'sidelocks', 'hairband')
MIN_COUNT = 30

CN = {
    'long hair': '长发', 'short hair': '短发', 'very long hair': '超长发', 'medium hair': '中长发',
    'absurdly long hair': '超长发', 'twintails': '双马尾', 'ponytail': '马尾', 'side ponytail': '侧马尾',
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
    'aqua hair': '水色发', 'navy hair': '深蓝发', 'multicolor hair': '彩虹发',
    'hair behind ear': '耳后发', 'hair spread out': '散发', 'hair pulled back': '后梳发',
}

count = collections.Counter()
best = {}
for it in chars:
    for tag in (it.get('tl') or []):
        low = tag.lower()
        if not any(k in low for k in KEYS):
            continue
        count[tag] += 1
        post = it.get('p') or 0
        cur = best.get(tag)
        if cur is None or post > cur[0]:
            best[tag] = (post, it.get('i') or '', it.get('n') or '', it.get('cn') or '')

rows = []
for tag, hits in count.items():
    if hits < MIN_COUNT:
        continue
    post, img, who, who_cn = best[tag]
    rows.append({
        'n': tag,
        'cn': CN.get(tag.lower(), tag),
        't': tag,
        'kw': ' '.join(x for x in (CN.get(tag.lower(), ''), who, who_cn) if x),
        'c': '头发', 'cc': '头发',
        'p': hits, 'f': 0,
        'i': img,
        'rep': who,
    })
rows.sort(key=lambda r: -r['p'])
json.dump(rows, open(os.path.join(DATA, 'hair.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
print('hair:', len(rows), '条 |', os.path.getsize(os.path.join(DATA, 'hair.json')), 'bytes')
print('中文覆盖:', sum(1 for r in rows if r['cn'] != r['n']), '/', len(rows))
for r in rows[:6]:
    print('  %-24s %-10s %6d 次  代表:%s' % (r['n'], r['cn'], r['p'], r['rep']))
