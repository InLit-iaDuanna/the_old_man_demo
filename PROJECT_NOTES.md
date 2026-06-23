# 项目必读

本文档记录当前工程的关键约束。继续改渲染、模型摆放、点位逻辑前先读这里，避免把已经确认过的风格和空间关系改回去。

## 当前入口

- 工作目录：`/Users/isduanna/Documents/hks_tx_1`
- 主入口：`/Users/isduanna/Documents/hks_tx_1/web/src/main.js`
- 运行：`npm run dev -- --port 5173`
- 预览：`http://127.0.0.1:5173/`
- 空间标记：`http://127.0.0.1:5173/?debug=1`。常规页面已收起空间标记入口，需要继续标点时再用这个地址。红点/编号 3D 标注默认隐藏，只保留调试列表和坐标数据。

## 风格约束

- 保持当前 toon/webtoon 风格，不要回退到真实材质光照。
- 白天使用策划色表，黄昏使用记忆暖区，夜晚使用冷区加选择性暖光。
- 白天路面保持淡灰色；斑马线和道路标记保持干净的白色或偏暖白。
- 不要重新加入之前的大块建筑阴影系统，除非用户明确要求。
- 不要添加凭空阴影。若以后要做阴影，必须来自实际模型或实际模型的简化复制体。
- 白天和黄昏不打开路灯；夜晚路灯只来自真实 `Lamppost` 对象。
- 夜晚窗户按几何/对象随机亮灭，不要整栋楼统一全亮。
- 云使用 `web/generated/cloud-*.png` 作为世界空间 Sprite，随场景移动，不是画在背景里。来源已替换为 `property/云/` 的新云资源，经 `scripts/preprocess-cloud-image.py` 抠透明+软边后覆盖 `cloud-1..5.png`（`npm run optimize:assets` 可复现）。
- 涂鸦/墙面污迹等 `decal`/`graffiti` 贴片需要保持单独的防闪设置：高 `renderOrder`、`polygonOffset`、关闭 `depthWrite`，并且不要参与 OutlinePass 或断线描边，避免和墙体共面闪烁。
- 爷爷使用双时期 GLB 模型（不再是程序化角色）：`texture` 贴图平涂模式用「正常爷爷」(`web/generated/grandpa/normal-*.glb`)，进入风格化画面（palette/memory/night）用「风格化爷爷」(`web/generated/grandpa/stylized-*.glb`)，由 `setGrandpaModelForMode` 跟随 `setMode` 切换。动画从简：idle/walk 两个 clip 按 `grandpaState.moving` 切显，不做复杂混合。加载失败回退到 `createGrandpaCharacter` 的程序化爷爷。
- 爷爷模型按包围盒自动缩放到目标身高 `grandpaModel.targetHeight ≈ 1.82`，双脚归一化到本地 y=0，再加 `grandpaPreview.groundLift = 0.02` 贴地。toon 描边走 OutlinePass，材质走 `makeGrandpaToonMaterial` 色块化。
- 爷爷只做轻度预览简化：色块化贴图上限 768px，保留原 GLB 网格和人物轮廓，不做重度减面。
- 第一人称视角默认出生在 `#4 我的出生点`，相机眼高从该点开始。出生朝向在"看向 `#3 邮箱`"基础上原地后转 180°（见 `setFirstPersonSpawnView` 末尾的 `yaw += Math.PI`），不是面壁。
- 关卡四是「玩家牵着爷爷一起走回家」：进入即 `startLevel4Companion`（不再用爷爷反向领走的过场）。走太快爷爷落后会用气泡+对话音提醒「你慢一点」；太远视为抛下，爷爷站着持续呼喊，回到 `rejoinDistance` 内自动重新牵上；爷爷在路上会停下来说几句；抛下状态下不能开送信面板。逻辑在 `updateLevel4Companion`。
- 角色说话用 `DialogueVoicePlayer`（`web/src/modules/dialogue-voice.js`）：每句从 `web/generated/voice/` 随机组合 2–6 段短碎片播放，相邻不重复，仅造"正在说话"感，不与中文文字逐字对应。可被其他 NPC 复用。
- 玩家和爷爷一样高，当前第一人称眼高约 `2.06`。
- 默认操作按正常第一人称游戏：点击画布锁定鼠标，鼠标转向，WASD/方向键在地面平面移动，Shift 加速，Esc 解锁；不允许上下飞行。

## 空间标记

来源：2026-06-20 Safari 调试界面，`127.0.0.1:5173/?debug=1`。

坐标系：当前 Three.js 世界坐标。`worldRoot` 加载后有 `rotation.y = Math.PI`，以下坐标已经是页面运行时的世界坐标。点号缺失是因为中间点已删除，不要自动重排编号。

| ID | 用途 | x | y | z | 表面 |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | 爷爷出生点 | -197.45 | 0.00 | -25.58 | SM_Sidewalk_Angle_5 / MI_Sidewalk |
| 3 | 邮箱任务点 | -211.66 | 0.02 | 12.95 | SM_Curbstone_71 / MI_Sidewalk |
| 4 | 我的出生点 | -211.79 | -0.01 | -26.94 | SM_Sidewalk_114 / MI_Sidewalk |
| 5 | 学校任务点 | -189.04 | -0.10 | 55.41 | SM_Road_Track19 / MI_Road_Track |
| 7 | 爷爷家任务点 | -199.16 | -0.20 | 108.84 | SM_Sidewalk_220 / MI_Road_Track |
| 8 | 轩尼锡道1段 | -194.16 | -0.10 | -13.39 | SM_Road_Track48 / MI_Road_Track |
| 9 | 轩尼锡道2段 | -193.38 | -0.10 | 37.91 | SM_Road_Track16 / MI_Road_Track |
| 10 | 轩尼锡道东2段 | -208.85 | -0.10 | 9.00 | SM_Road_Track55 / MI_Road_Track |
| 12 | 轩尼锡道东1段 | -207.29 | -0.10 | -32.05 | SM_Road_Track82 / MI_Road_Track |
| 13 | 轩尼锡道西1段 | -182.66 | -0.10 | -29.58 | SM_Road_Track69 / MI_Road_Track |

## JSON 备份

```json
[
  {
    "id": 1,
    "x": -197.45,
    "y": 0,
    "z": -25.58,
    "surface": "SM_Sidewalk_Angle_5 / MI_Sidewalk",
    "note": "爷爷出生点"
  },
  {
    "id": 3,
    "x": -211.66,
    "y": 0.02,
    "z": 12.95,
    "surface": "SM_Curbstone_71 / MI_Sidewalk",
    "note": "邮箱任务点"
  },
  {
    "id": 4,
    "x": -211.79,
    "y": -0.01,
    "z": -26.94,
    "surface": "SM_Sidewalk_114 / MI_Sidewalk",
    "note": "我的出生点"
  },
  {
    "id": 5,
    "x": -189.04,
    "y": -0.1,
    "z": 55.41,
    "surface": "SM_Road_Track19 / MI_Road_Track",
    "note": "学校任务点"
  },
  {
    "id": 7,
    "x": -199.16,
    "y": -0.2,
    "z": 108.84,
    "surface": "SM_Sidewalk_220 / MI_Road_Track",
    "note": "爷爷家任务点"
  },
  {
    "id": 8,
    "x": -194.16,
    "y": -0.1,
    "z": -13.39,
    "surface": "SM_Road_Track48 / MI_Road_Track",
    "note": "轩尼锡道1段"
  },
  {
    "id": 9,
    "x": -193.38,
    "y": -0.1,
    "z": 37.91,
    "surface": "SM_Road_Track16 / MI_Road_Track",
    "note": "轩尼锡道2段"
  },
  {
    "id": 10,
    "x": -208.85,
    "y": -0.1,
    "z": 9,
    "surface": "SM_Road_Track55 / MI_Road_Track",
    "note": "轩尼锡道东2段"
  },
  {
    "id": 12,
    "x": -207.29,
    "y": -0.1,
    "z": -32.05,
    "surface": "SM_Road_Track82 / MI_Road_Track",
    "note": "轩尼锡道东1段"
  },
  {
    "id": 13,
    "x": -182.66,
    "y": -0.1,
    "z": -29.58,
    "surface": "SM_Road_Track69 / MI_Road_Track",
    "note": "轩尼锡道西1段"
  }
]
```
