// Material layers of the shared texture arrays (one draw-call friendly material for the whole city).
// meters: real-world size of one texture tile; metal: metalness; anti: anti-tiling (unstructured surfaces only).
export const L = {
  BRICK: 0, LIMESTONE: 1, RUSTIC: 2, PLASTER: 3, PRECAST: 4, RUBBLE: 5, GRAVEL: 6, CLAY: 7,
  ZINC: 8, ASPHALT: 9, PAVERS: 10, CURB: 11, GRASS: 12, METAL: 13, WOOD: 14,
};

export const LAYER_DEFS = [
  { key: 'brick', name: 'طوب أحمر', meters: 2.4, metal: 0, anti: 0 },
  { key: 'limestone', name: 'حجر جيري', meters: 2.4, metal: 0, anti: 0 },
  { key: 'rustic', name: 'حجر خشن', meters: 2.4, metal: 0, anti: 0 },
  { key: 'plaster', name: 'جص', meters: 3.0, metal: 0, anti: 1 },
  { key: 'precast', name: 'خرسانة مسبقة', meters: 3.0, metal: 0, anti: 0 },
  { key: 'rubble', name: 'خرسانة مكسورة', meters: 2.0, metal: 0, anti: 1 },
  { key: 'gravel', name: 'سطح حصى', meters: 4.0, metal: 0, anti: 1 },
  { key: 'clay', name: 'قرميد', meters: 2.0, metal: 0, anti: 0 },
  { key: 'zinc', name: 'زنك', meters: 2.0, metal: 0.85, anti: 0 },
  { key: 'asphalt', name: 'أسفلت', meters: 6.0, metal: 0, anti: 1 },
  { key: 'pavers', name: 'بلاط رصيف', meters: 2.0, metal: 0, anti: 0 },
  { key: 'curb', name: 'جرانيت', meters: 1.0, metal: 0, anti: 0 },
  { key: 'grass', name: 'عشب', meters: 3.0, metal: 0, anti: 1 },
  { key: 'metal', name: 'معدن مطلي', meters: 1.0, metal: 0.7, anti: 0 },
  { key: 'wood', name: 'خشب', meters: 1.0, metal: 0, anti: 0 },
];

export const LAYER_COUNT = LAYER_DEFS.length;
