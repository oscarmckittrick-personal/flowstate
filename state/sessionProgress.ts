let currentLevelId = 1;

export const getCurrentLevelId = () => currentLevelId;

export const setCurrentLevelId = (levelId: number) => {
  if (!Number.isFinite(levelId) || levelId <= 0) return;
  currentLevelId = Math.floor(levelId);
};

export const resetCurrentLevelId = () => {
  currentLevelId = 1;
};

export const clampLevelId = (levelId: number, maxLevelId: number) => {
  if (!Number.isFinite(levelId)) return 1;
  const safeMax = Number.isFinite(maxLevelId) && maxLevelId > 0 ? maxLevelId : levelId;
  return Math.max(1, Math.min(Math.floor(levelId), Math.floor(safeMax)));
};
