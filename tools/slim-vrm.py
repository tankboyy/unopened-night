"""VRM(GLB) 다이어트: 표정용 모프 타깃을 빼고 텍스처를 줄인다. VRM 확장 정보는 그대로 둔다.

일반 glTF 도구(gltf-transform·gltfpack)는 모르는 확장(VRM)을 지워서 쓸 수 없다 — 그래서 직접 바이너리를 다시 쓴다.
사용: python3 tools/slim-vrm.py <입력.vrm> <출력.vrm> [--max-tex 512] [--blank-tex]
  --blank-tex : 텍스처를 1픽셀로 (뼈대만 빌려 쓰는 아바타용 — 공연자 바탕 Bruno)
"""
import io, json, struct, sys
from PIL import Image

def main():
    src, dst = sys.argv[1], sys.argv[2]
    max_tex = int(sys.argv[sys.argv.index('--max-tex') + 1]) if '--max-tex' in sys.argv else 512
    blank = '--blank-tex' in sys.argv
    b = open(src, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_off = 20 + jl + 8
    binl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    blob = b[bin_off:bin_off + binl]

    # 1) 모프 타깃 제거 — 표정(눈 깜빡임·입 모양)은 쓰지 않는다
    for m in j.get('meshes', []):
        m.pop('weights', None)
        (m.get('extras') or {}).pop('targetNames', None)
        for p in m['primitives']:
            p.pop('targets', None)
            (p.get('extras') or {}).pop('targetNames', None)
    vrm = j.get('extensions', {}).get('VRM')
    if vrm:
        for g in vrm.get('blendShapeMaster', {}).get('blendShapeGroups', []):
            g['binds'] = []  # 지운 모프 타깃을 가리키지 않게
    vrmc = j.get('extensions', {}).get('VRMC_vrm')
    if vrmc:
        for group in (vrmc.get('expressions') or {}).values():
            for e in (group or {}).values():
                if isinstance(e, dict):
                    e['morphTargetBinds'] = []

    # 2) 아직 쓰이는 accessor
    used_acc = set()
    for m in j.get('meshes', []):
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for a in j.get('animations', []):
        for smp in a['samplers']:
            used_acc.update([smp['input'], smp['output']])
    for i, acc in enumerate(j.get('accessors', [])):
        if i not in used_acc:
            acc.pop('bufferView', None)  # 값은 0 으로 취급 — 로더가 읽지도 않는다
            acc.pop('byteOffset', None)
            acc.pop('sparse', None)

    # 3) 텍스처 줄이기
    new_img_bytes = {}
    for ii, img in enumerate(j.get('images', [])):
        if 'bufferView' not in img:
            continue
        v = j['bufferViews'][img['bufferView']]
        raw = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        im = Image.open(io.BytesIO(raw))
        if blank:
            im = Image.new('RGBA', (1, 1), (128, 128, 128, 255))
        elif max(im.size) > max_tex:
            k = max_tex / max(im.size)
            im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, format='PNG', optimize=True)
        new_img_bytes[ii] = out.getvalue()
        img['mimeType'] = 'image/png'

    # 4) 쓰이는 bufferView 만 새 바이너리에 다시 담는다(번호도 다시 매긴다)
    used_bv = set()
    for acc in j.get('accessors', []):
        if 'bufferView' in acc:
            used_bv.add(acc['bufferView'])
    for img in j.get('images', []):
        if 'bufferView' in img:
            used_bv.add(img['bufferView'])
    remap = {}
    out_bin = bytearray()
    new_views = []
    img_by_view = {img['bufferView']: ii for ii, img in enumerate(j.get('images', [])) if 'bufferView' in img}
    for old, v in enumerate(j.get('bufferViews', [])):
        if old not in used_bv:
            continue
        while len(out_bin) % 4:
            out_bin.append(0)
        if old in img_by_view and img_by_view[old] in new_img_bytes:
            data = new_img_bytes[img_by_view[old]]
        else:
            data = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        nv = dict(v)
        nv['byteOffset'] = len(out_bin)
        nv['byteLength'] = len(data)
        nv['buffer'] = 0
        out_bin += data
        remap[old] = len(new_views)
        new_views.append(nv)
    while len(out_bin) % 4:
        out_bin.append(0)
    j['bufferViews'] = new_views
    for acc in j.get('accessors', []):
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
    for img in j.get('images', []):
        if 'bufferView' in img:
            img['bufferView'] = remap[img['bufferView']]
    j['buffers'] = [{'byteLength': len(out_bin)}]

    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(out_bin), b'BIN\x00')); f.write(out_bin)
    print(f'{src} {len(b)/1e6:.2f}MB -> {total/1e6:.2f}MB')

main()
