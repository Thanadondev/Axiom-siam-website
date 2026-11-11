"""
Shrinks a Blender-exported GLB the way the kit models were (KHR_mesh_quantization):
POSITION as normalized int16 (the node carries the scale and offset back), NORMAL and
_RESTN (unit normals) as normalized int8, indices as uint16 when they fit. _REST and
TEXCOORD_0 stay full floats: the web paints the pattern from _REST and measures it.
Usage: python quantize_glb.py in.glb out.glb
(meshopt from glTF-Transform shrinks further: npx @gltf-transform/cli@4.5.1 meshopt in.glb out.glb)
"""
import json
import struct
import sys

import numpy as np

src, dst = sys.argv[1], sys.argv[2]
b = open(src, "rb").read()
jl = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + jl])
bin_off = 20 + jl + 8
BIN = b[bin_off:bin_off + struct.unpack("<I", b[20 + jl:24 + jl])[0]]
assert not j.get("images"), "textures in the file: not handled"

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read(ai):
    a = j["accessors"][ai]
    bv = j["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]])
    n = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", dt.itemsize * n)
    raw = np.frombuffer(BIN, dtype=np.uint8, count=stride * (a["count"] - 1) + dt.itemsize * n, offset=off)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], dt.itemsize * n), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dt).reshape(a["count"], n)


out = bytearray()
views, accs = [], []


def put(arr, target=None, stride=None):
    while len(out) % 4:
        out.append(0)
    v = {"buffer": 0, "byteOffset": len(out), "byteLength": arr.nbytes}
    if stride:
        v["byteStride"] = stride
    if target:
        v["target"] = target
    out.extend(arr.tobytes())
    views.append(v)
    return len(views) - 1


# one scale and offset for every position (they share the node)
pos_ids = sorted({p["attributes"]["POSITION"] for m in j["meshes"] for p in m["primitives"]})
allp = np.concatenate([read(i) for i in pos_ids]).astype(np.float64)
lo, hi = allp.min(0), allp.max(0)
centre = (lo + hi) / 2
half = float(((hi - lo) / 2).max())

done = {}
for m in j["meshes"]:
    for p in m["primitives"]:
        for name, ai in list(p["attributes"].items()):
            key = (name, ai)
            if key in done:
                p["attributes"][name] = done[key]
                continue
            a = j["accessors"][ai]
            data = read(ai)
            if name == "POSITION":
                q = np.round((data - centre) / half * 32767).astype(np.int16)
                padded = np.zeros((len(q), 4), np.int16)
                padded[:, :3] = q
                bvi = put(padded, 34962, 8)
                acc = {"bufferView": bvi, "componentType": 5122, "normalized": True, "count": len(q), "type": "VEC3",
                       "min": q.min(0).tolist(), "max": q.max(0).tolist()}
            elif name in ("NORMAL", "_RESTN"):  # unit normals; the shader reads _restn only for which way a face points
                nrm = data / np.maximum(np.linalg.norm(data, axis=1, keepdims=True), 1e-9)
                q = np.round(nrm * 127).astype(np.int8)
                padded = np.zeros((len(q), 4), np.int8)
                padded[:, :3] = q
                bvi = put(padded, 34962, 4)
                acc = {"bufferView": bvi, "componentType": 5120, "normalized": True, "count": len(q), "type": "VEC3"}
            else:
                bvi = put(np.ascontiguousarray(data), 34962)
                acc = {k: v for k, v in a.items() if k not in ("bufferView", "byteOffset")}
                acc["bufferView"] = bvi
            accs.append(acc)
            done[key] = len(accs) - 1
            p["attributes"][name] = done[key]
        if "indices" in p:
            idx = read(p["indices"]).reshape(-1)
            small = idx.max() < 65535
            arr = idx.astype(np.uint16 if small else np.uint32)
            bvi = put(arr, 34963)
            accs.append({"bufferView": bvi, "componentType": 5123 if small else 5125, "count": len(arr), "type": "SCALAR"})
            p["indices"] = len(accs) - 1

j["accessors"], j["bufferViews"] = accs, views
while len(out) % 4:
    out.append(0)
j["buffers"] = [{"byteLength": len(out)}]
# the node puts the positions back where they were (its mesh had no transform of its own)
for nd in j["nodes"]:
    if "mesh" in nd:
        assert not any(k in nd for k in ("matrix", "rotation", "scale", "translation")), "node already transformed"
        nd["translation"] = centre.tolist()
        nd["scale"] = [half, half, half]
for ext in ("extensionsUsed", "extensionsRequired"):
    j[ext] = sorted(set(j.get(ext, [])) | {"KHR_mesh_quantization"})

js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, "wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, total))
    f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
    f.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))
print(f"{src} {len(b)} -> {dst} {total} bytes; scale {half:.4f}")
