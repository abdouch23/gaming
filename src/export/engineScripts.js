// Engine-side helpers shipped inside the export zip.

export const UNITY_SCRIPT = `// AAA Procedural City - Unity setup (Editor script)
// 1) Install glTFast: Package Manager > + > Add package by name > com.unity.cloud.gltfast
// 2) Put city.glb in Assets/, drag it into the scene, select the root object.
// 3) Menu: Tools > AAA City > Setup Selected City
//    - nodes named COL_* get a MeshCollider and their renderer is disabled (invisible collision)
//    - everything else is marked static (batching, GI, occlusion, reflection probes)
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class AAACitySetup
{
    [MenuItem("Tools/AAA City/Setup Selected City")]
    static void Setup()
    {
        var roots = Selection.gameObjects;
        if (roots.Length == 0)
        {
            EditorUtility.DisplayDialog("AAA City", "Select the imported city object in the Hierarchy first.", "OK");
            return;
        }
        int colliders = 0, statics = 0;
        const StaticEditorFlags flags = StaticEditorFlags.ContributeGI | StaticEditorFlags.OccludeeStatic |
            StaticEditorFlags.BatchingStatic | StaticEditorFlags.ReflectionProbeStatic;
        foreach (var root in roots)
        {
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
            {
                var go = t.gameObject;
                if (go.name.StartsWith("COL_"))
                {
                    var mf = go.GetComponent<MeshFilter>();
                    if (mf != null && mf.sharedMesh != null)
                    {
                        var mc = go.GetComponent<MeshCollider>();
                        if (mc == null) mc = Undo.AddComponent<MeshCollider>(go);
                        mc.sharedMesh = mf.sharedMesh;
                        colliders++;
                    }
                    var mr = go.GetComponent<MeshRenderer>();
                    if (mr != null) { Undo.RecordObject(mr, "AAA City"); mr.enabled = false; }
                }
                var f = flags;
                if (go.name.StartsWith("Buildings_") || go.name == "Ground") f |= StaticEditorFlags.OccluderStatic;
                GameObjectUtility.SetStaticEditorFlags(go, f);
                statics++;
            }
        }
        Debug.Log($"AAA City: {colliders} mesh colliders, {statics} static objects.");
    }
}
#endif
`;

export const UNREAL_SCRIPT = `"""AAA Procedural City - Unreal Engine 5 setup.

1) Enable plugins: Python Editor Script Plugin (and Interchange / glTF importer, on by default in 5.x).
2) File > Import Into Level... > city.glb  (keeps the node hierarchy and names as actors)
3) Tools > Execute Python Script... > this file

What it does:
  - actors labelled COL_*  : mesh collision = "Use Complex Collision As Simple", hidden, BlockAll
  - all other meshes      : auto-generated collision removed, NoCollision, Nanite enabled
glTF has no reliable collision convention for Unreal's importer, hence this script.
"""
import unreal

ENABLE_NANITE = True

actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
mesh_sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)

done = {}
n_col = n_vis = 0
with unreal.ScopedSlowTask(1, "AAA City setup") as task:
    task.make_dialog(True)
    for actor in actor_sub.get_all_level_actors():
        comp = actor.get_component_by_class(unreal.StaticMeshComponent)
        if comp is None:
            continue
        mesh = comp.static_mesh
        if mesh is None:
            continue
        label = actor.get_actor_label()
        is_col = label.startswith("COL_") or mesh.get_name().startswith("COL_")
        path = mesh.get_path_name()
        try:
            if is_col:
                actor.set_actor_hidden_in_game(True)
                comp.set_visibility(False)
                comp.set_collision_profile_name("BlockAll")
                if path not in done:
                    body = mesh.get_editor_property("body_setup")
                    body.set_editor_property("collision_trace_flag", unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
                    done[path] = mesh
                n_col += 1
            else:
                comp.set_collision_profile_name("NoCollision")
                if path not in done:
                    mesh_sub.remove_collisions(mesh)
                    if ENABLE_NANITE:
                        ns = mesh.get_editor_property("nanite_settings")
                        ns.enabled = True
                        mesh.set_editor_property("nanite_settings", ns)
                    done[path] = mesh
                n_vis += 1
        except Exception as e:  # keep going on unexpected assets
            unreal.log_warning("AAA City: %s: %s" % (label, e))

for path, mesh in done.items():
    mesh.modify()
    unreal.EditorAssetLibrary.save_asset(path, only_if_is_dirty=False)

unreal.log("AAA City: %d collision actors, %d visual actors, %d mesh assets updated" % (n_col, n_vis, len(done)))
`;

const COMMON = `
## Contents / المحتوى
- \`city.glb\` — glTF 2.0 binary: buildings (full detail, tiled 160 m), glass, ground (roads, curbs, sidewalks, lawns),
  road markings (real geometry), trees, street lamps, parked cars, collision meshes. PBR metallic-roughness materials
  with embedded textures: BaseColor (sRGB), Normal (OpenGL / glTF convention), ORM (R = AO, G = roughness, B = metallic).
- \`textures_height/*.png\` — height maps per material (for displacement / Nanite tessellation / parallax).
- \`city.json\` — metadata: seed, generator parameters, every building (id, style, floors, position, rotation, size, tiers).
- Units: metres, Y-up (engines convert on import). UVs tile in world space (repeat wrap).

## Collision / التصادم
Simplified meshes, not the visual geometry: one box per building tier + roof volume, cylinders for trunks and lamp
posts, boxes for parked cars, and the ground mesh (curbs and sidewalk heights included).
`;

export function exportReadme(target) {
  const guide = {
    unreal: `# Unreal Engine 5
1. **File → Import Into Level…** → \`city.glb\` (Interchange glTF importer).
2. **Tools → Execute Python Script…** → \`Unreal/aaa_city_setup.py\` (needs the *Python Editor Script Plugin*).
   - \`COL_*\` actors → *Use Complex Collision As Simple*, hidden, BlockAll.
   - Visual meshes → collision removed, **Nanite enabled**.
3. Lighting: enable **Lumen** (Project Settings → Rendering → Dynamic GI = Lumen, Reflections = Lumen) and add a
   Directional Light + Sky Atmosphere + Sky Light + Exponential Height Fog.
4. Optional: plug \`textures_height\` into the materials for Nanite tessellation / displacement.

> Unreal's glTF importer does not honour the \`UCX_\` collision prefix (known issue), which is why collision is set by the script.
`,
    unity: `# Unity (URP / HDRP / Built-in)
1. Install **glTFast**: Package Manager → + → *Add package by name* → \`com.unity.cloud.gltfast\`.
2. Copy \`city.glb\` and the \`Unity\` folder into \`Assets/\`.
3. Drag \`city.glb\` into the scene, select its root, then **Tools → AAA City → Setup Selected City**.
   - \`COL_*\` objects get a **MeshCollider** and are made invisible; everything is marked static.
4. Bake occlusion culling / lighting as usual.
`,
    godot: `# Godot 4
1. Copy the folder into your project (\`res://city/\`). Godot imports \`city.glb\` automatically.
2. Collision is created **on import** by Godot's node-name suffixes (Import dock → *Use Node Type Suffixes* = on, default):
   - \`*-colonly\` → \`StaticBody3D\` + trimesh collision, mesh removed (buildings, props).
   - \`Ground-col\` → visible ground + trimesh collision.
3. Instance \`city.glb\` in a scene and add a \`WorldEnvironment\` (SDFGI or VoxelGI) and a \`DirectionalLight3D\`.
`,
    gltf: `# Generic glTF (Blender, three.js, Babylon.js, …)
- Collision meshes are named \`COL_*\` and carry \`extras.collision = true\`; hide them or convert them to physics bodies.
- Blender: File → Import → glTF 2.0.
`,
  }[target];
  return guide + COMMON;
}
