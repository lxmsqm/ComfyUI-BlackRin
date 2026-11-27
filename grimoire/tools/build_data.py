import json, gzip, os
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

# ⚠️ 按你的机器改：AstrBot 插件的 allinone 数据目录
BIG = '/root/AstrBot/data/comfyui_allinone_data/user/'
NEW = '/root/tmp/astcomf/'
OUT = OUT_DIR

def load(p):
    return json.load(open(p, encoding='utf-8'))['items']

def merge_chars():
    big = load(BIG + 'anima_characters_cache.json')
    new = load(NEW + 'chars.json')
    seen = {}
    for x in big:
        seen[x['name'].lower()] = {
            'n': x['name'], 'cn': x.get('name_cn') or x['name'],
            't': x['tags'], 'c': x.get('category') or '',
            'cc': x.get('category_cn') or x.get('category') or '',
            'p': x.get('post_count') or 0, 'f': x.get('fav_count') or 0,
            'i': x.get('image_url') or '',
            'tl': x.get('tags_list') or [],
        }
    added = 0
    for x in new:
        k = x['name'].lower()
        if k in seen:
            continue
        seen[k] = {
            'n': x['name'], 'cn': x.get('name_cn') or x['name'],
            't': x['tags'], 'c': x.get('category') or '',
            'cc': x.get('category_cn') or x.get('category') or '',
            'p': x.get('post_count') or 0, 'f': x.get('fav_count') or 0,
            'i': x.get('image_url') or '',
            'tl': x.get('tags_list') or [],
        }
        added += 1
    items = sorted(seen.values(), key=lambda d: (-d['p'], d['n'].lower()))
    print('characters: big=%d new=%d added=%d total=%d' % (len(big), len(new), added, len(items)))
    return items

def merge_artists():
    big = load(BIG + 'anima_artists_cache.json')
    new = load(NEW + 'artists.json')
    seen = {}
    for x in big:
        seen[x['name'].lower()] = {
            'n': x['name'], 't': x['tags'], 'p': x.get('post_count') or 0,
            'f': x.get('fav_count') or 0, 's': round(float(x.get('score') or 0), 4),
            'i': x.get('image_url') or '',
        }
    added = 0
    for x in new:
        k = x['name'].lower()
        if k in seen:
            continue
        seen[k] = {
            'n': x['name'], 't': x['tags'], 'p': x.get('post_count') or 0,
            'f': x.get('fav_count') or 0, 's': round(float(x.get('score') or 0), 4),
            'i': x.get('image_url') or '',
        }
        added += 1
    items = sorted(seen.values(), key=lambda d: (-d['p'], d['n'].lower()))
    print('artists: big=%d new=%d added=%d total=%d' % (len(big), len(new), added, len(items)))
    return items

for name, items in (('characters', merge_chars()), ('artists', merge_artists())):
    raw = json.dumps(items, ensure_ascii=False, separators=(',', ':')).encode()
    p = OUT + name + '.json'
    open(p, 'wb').write(raw)
    print('%s: %.1f MB raw, %.1f MB gzip' % (name, len(raw)/1e6, len(gzip.compress(raw, 6))/1e6))
