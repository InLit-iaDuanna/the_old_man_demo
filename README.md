# 最后一封信 Web Toon Preview

Three.js/Vite 场景预览工程，用于加载街区 GLTF、云资产和爷爷人物资产，并在 Web 里做白天、贴图平涂、黄昏、夜晚四套风格化渲染。

## 运行

```bash
npm run dev -- --port 5173
```

预览地址：

- 常规预览：http://127.0.0.1:5173/
- 空间标记调试：http://127.0.0.1:5173/?debug=1

## 项目必读

修改前先读 [PROJECT_NOTES.md](PROJECT_NOTES.md)。里面记录了当前风格约束、模型点位、不要回退的决策，以及空间标记完整 JSON。

## 空间标记

这些点位来自 2026-06-20 在 Safari 调试界面完成的空间标记。坐标是当前 Three.js 世界坐标，点号缺失代表中间标记已删除。

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
