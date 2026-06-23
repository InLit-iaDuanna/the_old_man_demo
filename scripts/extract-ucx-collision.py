#!/usr/bin/env python3
"""Extract UE-style UCX collision meshes from a binary FBX into a lightweight glTF."""

from __future__ import annotations

import json
import math
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "models/collision/Demo1_collision_source.fbx"
OUTPUT_DIR = ROOT / "web/generated"
OUTPUT_GLTF_PATH = OUTPUT_DIR / "Demo0620_1_collision.gltf"
OUTPUT_BIN_PATH = OUTPUT_DIR / "Demo0620_1_collision.bin"

GROUND_NAME_PARTS = (
    "road",
    "sidewalk",
    "curbstone",
    "tactile",
    "hatchway",
    "floor",
    "ground",
)


@dataclass
class FbxNode:
    name: str
    props: list
    children: list["FbxNode"] = field(default_factory=list)


@dataclass
class GeometryRecord:
    id: int
    name: str
    vertices: list[tuple[float, float, float]]
    polygons: list[list[int]]


@dataclass
class ModelRecord:
    id: int
    name: str
    translation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0)


class BinaryFbxParser:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.version = struct.unpack_from("<I", data, 23)[0]
        self.wide = self.version >= 7500
        self.header_size = 25 if self.wide else 13
        self.null_size = self.header_size

    def parse(self) -> list[FbxNode]:
        if not self.data.startswith(b"Kaydara FBX Binary"):
            raise ValueError("Expected a binary FBX file")
        return self._parse_nodes(27, len(self.data))

    def _parse_nodes(self, start: int, end: int) -> list[FbxNode]:
        nodes = []
        offset = start
        while offset < end:
            if offset + self.header_size > len(self.data):
                break

            if self.wide:
                end_offset = self._u64(offset)
                prop_count = self._u64(offset + 8)
                prop_len = self._u64(offset + 16)
                name_len = self.data[offset + 24]
                cursor = offset + 25
            else:
                end_offset = self._u32(offset)
                prop_count = self._u32(offset + 4)
                prop_len = self._u32(offset + 8)
                name_len = self.data[offset + 12]
                cursor = offset + 13

            if end_offset == 0 and prop_count == 0 and prop_len == 0 and name_len == 0:
                offset += self.null_size
                continue

            if end_offset <= offset or end_offset > len(self.data):
                break

            name = self.data[cursor:cursor + name_len].decode("utf-8", "replace")
            cursor += name_len
            props = []
            try:
                for _ in range(prop_count):
                    value, cursor = self._read_property(cursor)
                    props.append(value)
            except Exception:
                offset = end_offset
                continue

            node = FbxNode(name=name, props=props)
            if cursor < end_offset - self.null_size:
                node.children = self._parse_nodes(cursor, end_offset - self.null_size)
            nodes.append(node)
            offset = end_offset

        return nodes

    def _read_property(self, offset: int):
        prop_type = chr(self.data[offset])
        offset += 1

        if prop_type == "Y":
            return struct.unpack_from("<h", self.data, offset)[0], offset + 2
        if prop_type == "C":
            return bool(self.data[offset]), offset + 1
        if prop_type == "I":
            return struct.unpack_from("<i", self.data, offset)[0], offset + 4
        if prop_type == "F":
            return struct.unpack_from("<f", self.data, offset)[0], offset + 4
        if prop_type == "D":
            return struct.unpack_from("<d", self.data, offset)[0], offset + 8
        if prop_type == "L":
            return struct.unpack_from("<q", self.data, offset)[0], offset + 8
        if prop_type in "fdlibc":
            length = self._u32(offset)
            encoding = self._u32(offset + 4)
            compressed_len = self._u32(offset + 8)
            offset += 12
            raw = self.data[offset:offset + compressed_len]
            if encoding == 1:
                raw = zlib.decompress(raw)
            return self._decode_array(prop_type, length, raw), offset + compressed_len
        if prop_type in "SR":
            length = self._u32(offset)
            offset += 4
            raw = self.data[offset:offset + length]
            if prop_type == "S":
                return raw.decode("utf-8", "replace"), offset + length
            return raw, offset + length

        raise ValueError(f"Unsupported FBX property type {prop_type!r}")

    @staticmethod
    def _decode_array(prop_type: str, length: int, raw: bytes) -> list:
        formats = {
            "f": "f",
            "d": "d",
            "i": "i",
            "l": "q",
            "b": "b",
            "c": "?",
        }
        fmt = formats[prop_type]
        item_size = struct.calcsize("<" + fmt)
        if len(raw) < length * item_size:
            raise ValueError("FBX array data is shorter than declared")
        return list(struct.unpack("<" + fmt * length, raw[:length * item_size]))

    def _u32(self, offset: int) -> int:
        return struct.unpack_from("<I", self.data, offset)[0]

    def _u64(self, offset: int) -> int:
        return struct.unpack_from("<Q", self.data, offset)[0]


def clean_fbx_name(value) -> str:
    if not isinstance(value, str):
        return ""
    value = value.replace("\x00\x01", "|")
    if "::" in value:
        value = value.split("::", 1)[1]
    if "|" in value:
        value = value.split("|", 1)[0]
    return value


def find_child(node: FbxNode, name: str) -> FbxNode | None:
    for child in node.children:
        if child.name == name:
            return child
    return None


def collect_fbx_data(nodes: list[FbxNode]):
    objects = next((node for node in nodes if node.name == "Objects"), None)
    connections = next((node for node in nodes if node.name == "Connections"), None)
    if not objects or not connections:
        raise ValueError("FBX does not contain Objects/Connections sections")

    geometries: dict[int, GeometryRecord] = {}
    models: dict[int, ModelRecord] = {}
    connections_oo: list[tuple[int, int]] = []

    for child in objects.children:
        if child.name == "Geometry" and len(child.props) >= 3 and child.props[2] == "Mesh":
            geometry = parse_geometry(child)
            if geometry:
                geometries[geometry.id] = geometry
        elif child.name == "Model" and len(child.props) >= 3 and child.props[2] == "Mesh":
            model = parse_model(child)
            models[model.id] = model

    for child in connections.children:
        if child.name == "C" and len(child.props) >= 3 and child.props[0] == "OO":
            connections_oo.append((int(child.props[1]), int(child.props[2])))

    geometry_to_models: dict[int, list[int]] = {}
    model_to_parent: dict[int, int] = {}
    for child_id, parent_id in connections_oo:
        if child_id in geometries and parent_id in models:
            geometry_to_models.setdefault(child_id, []).append(parent_id)
        elif child_id in models and parent_id in models:
            model_to_parent[child_id] = parent_id

    return geometries, models, geometry_to_models, model_to_parent


def parse_geometry(node: FbxNode) -> GeometryRecord | None:
    vertices_node = find_child(node, "Vertices")
    polygon_node = find_child(node, "PolygonVertexIndex")
    if not vertices_node or not polygon_node or not vertices_node.props or not polygon_node.props:
        return None

    raw_vertices = vertices_node.props[0]
    raw_indices = polygon_node.props[0]
    if not isinstance(raw_vertices, list) or not isinstance(raw_indices, list):
        return None

    vertices = [
        (float(raw_vertices[i]), float(raw_vertices[i + 1]), float(raw_vertices[i + 2]))
        for i in range(0, len(raw_vertices) - 2, 3)
    ]

    polygons = []
    current = []
    for raw_index in raw_indices:
        index = int(raw_index)
        if index < 0:
            current.append(-index - 1)
            if len(current) >= 3:
                polygons.append(current)
            current = []
        else:
            current.append(index)

    return GeometryRecord(
        id=int(node.props[0]),
        name=clean_fbx_name(node.props[1]),
        vertices=vertices,
        polygons=polygons,
    )


def parse_model(node: FbxNode) -> ModelRecord:
    model = ModelRecord(id=int(node.props[0]), name=clean_fbx_name(node.props[1]))
    props70 = find_child(node, "Properties70")
    if not props70:
        return model

    for prop_node in props70.children:
        if prop_node.name != "P" or len(prop_node.props) < 7:
            continue
        name = prop_node.props[0]
        values = tuple(float(value) for value in prop_node.props[4:7])
        if name == "Lcl Translation":
            model.translation = values
        elif name == "Lcl Rotation":
            model.rotation = values
        elif name == "Lcl Scaling":
            model.scale = values

    return model


def include_collision_name(name: str) -> bool:
    lower = name.lower()
    return lower.startswith("ucx_") and not any(part in lower for part in GROUND_NAME_PARTS)


def identity_matrix() -> list[list[float]]:
    return [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def multiply_matrix(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [
        [
            sum(a[row][i] * b[i][col] for i in range(4))
            for col in range(4)
        ]
        for row in range(4)
    ]


def translation_matrix(x: float, y: float, z: float) -> list[list[float]]:
    matrix = identity_matrix()
    matrix[0][3] = x
    matrix[1][3] = y
    matrix[2][3] = z
    return matrix


def scale_matrix(x: float, y: float, z: float) -> list[list[float]]:
    matrix = identity_matrix()
    matrix[0][0] = x
    matrix[1][1] = y
    matrix[2][2] = z
    return matrix


def rotation_matrix_xyz(rx_deg: float, ry_deg: float, rz_deg: float) -> list[list[float]]:
    rx = math.radians(rx_deg)
    ry = math.radians(ry_deg)
    rz = math.radians(rz_deg)
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    mx = [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, cx, -sx, 0.0],
        [0.0, sx, cx, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    my = [
        [cy, 0.0, sy, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [-sy, 0.0, cy, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    mz = [
        [cz, -sz, 0.0, 0.0],
        [sz, cz, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    return multiply_matrix(multiply_matrix(mz, my), mx)


def local_model_matrix(model: ModelRecord) -> list[list[float]]:
    return multiply_matrix(
        translation_matrix(*model.translation),
        multiply_matrix(rotation_matrix_xyz(*model.rotation), scale_matrix(*model.scale)),
    )


def transform_point(matrix: list[list[float]], point: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = point
    return (
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
        matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3],
    )


def to_three_position(point: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = point
    return (x / 100.0, z / 100.0, -y / 100.0)


def compute_world_matrices(models: dict[int, ModelRecord], parents: dict[int, int]) -> dict[int, list[list[float]]]:
    cache: dict[int, list[list[float]]] = {}

    def resolve(model_id: int) -> list[list[float]]:
        if model_id in cache:
            return cache[model_id]
        local = local_model_matrix(models[model_id])
        parent_id = parents.get(model_id)
        if parent_id in models:
            world = multiply_matrix(resolve(parent_id), local)
        else:
            world = local
        cache[model_id] = world
        return world

    for model_id in models:
        resolve(model_id)
    return cache


def extract_collision_mesh():
    parser = BinaryFbxParser(SOURCE_PATH.read_bytes())
    nodes = parser.parse()
    geometries, models, geometry_to_models, model_parents = collect_fbx_data(nodes)
    world_matrices = compute_world_matrices(models, model_parents)

    positions: list[float] = []
    indices: list[int] = []
    included = 0
    excluded_ground = 0
    skipped_missing = 0

    for geometry_id, model_ids in geometry_to_models.items():
        geometry = geometries.get(geometry_id)
        if not geometry:
            continue

        for model_id in model_ids:
            model = models.get(model_id)
            if not model or not model.name.upper().startswith("UCX_"):
                continue
            if not include_collision_name(model.name):
                excluded_ground += 1
                continue
            if model_id not in world_matrices:
                skipped_missing += 1
                continue

            base_index = len(positions) // 3
            matrix = world_matrices[model_id]
            for vertex in geometry.vertices:
                positions.extend(to_three_position(transform_point(matrix, vertex)))

            for polygon in geometry.polygons:
                if len(polygon) < 3:
                    continue
                first = polygon[0]
                for i in range(1, len(polygon) - 1):
                    indices.extend([
                        base_index + first,
                        base_index + polygon[i],
                        base_index + polygon[i + 1],
                    ])
            included += 1

    if not positions or not indices:
        raise RuntimeError("No UCX collision triangles were extracted")

    return {
        "positions": positions,
        "indices": indices,
        "included": included,
        "excluded_ground": excluded_ground,
        "skipped_missing": skipped_missing,
    }


def write_gltf(mesh_data: dict) -> None:
    positions = mesh_data["positions"]
    indices = mesh_data["indices"]
    index_format = "I" if max(indices) > 65535 else "H"
    index_component_type = 5125 if index_format == "I" else 5123

    position_bytes = struct.pack("<" + "f" * len(positions), *positions)
    index_bytes = struct.pack("<" + index_format * len(indices), *indices)

    def pad4(data: bytes) -> bytes:
        return data + (b"\x00" * ((4 - len(data) % 4) % 4))

    index_offset = 0
    position_offset = len(pad4(index_bytes))
    bin_blob = pad4(index_bytes) + pad4(position_bytes)

    xs = positions[0::3]
    ys = positions[1::3]
    zs = positions[2::3]

    gltf = {
        "asset": {"version": "2.0", "generator": "extract-ucx-collision.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "Demo0620_1_UCX_Collision", "mesh": 0}],
        "meshes": [{
            "name": "Demo0620_1_UCX_Collision",
            "primitives": [{
                "attributes": {"POSITION": 1},
                "indices": 0,
                "mode": 4,
            }],
        }],
        "buffers": [{"uri": OUTPUT_BIN_PATH.name, "byteLength": len(bin_blob)}],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": index_offset,
                "byteLength": len(index_bytes),
                "target": 34963,
            },
            {
                "buffer": 0,
                "byteOffset": position_offset,
                "byteLength": len(position_bytes),
                "target": 34962,
            },
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": index_component_type,
                "count": len(indices),
                "type": "SCALAR",
                "min": [min(indices)],
                "max": [max(indices)],
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": len(positions) // 3,
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            },
        ],
        "extras": {
            "coordinateMap": "FBX centimeters (x,y,z) -> glTF meters (x,z,-y)",
            "includedUcxModels": mesh_data["included"],
            "excludedGroundUcxModels": mesh_data["excluded_ground"],
            "skippedMissingModels": mesh_data["skipped_missing"],
            "triangleCount": len(indices) // 3,
        },
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_BIN_PATH.write_bytes(bin_blob)
    OUTPUT_GLTF_PATH.write_text(json.dumps(gltf, separators=(",", ":")) + "\n", encoding="utf-8")

    print(
        "Wrote "
        f"{OUTPUT_GLTF_PATH} "
        f"({mesh_data['included']} UCX models, "
        f"{mesh_data['excluded_ground']} ground UCX excluded, "
        f"{len(indices) // 3} triangles)"
    )


def main() -> None:
    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Missing collision source: {SOURCE_PATH}")
    write_gltf(extract_collision_mesh())


if __name__ == "__main__":
    main()
