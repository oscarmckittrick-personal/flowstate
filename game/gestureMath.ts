export const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const axisSteps = (delta: number, size: number) => {
  const absDelta = Math.abs(delta);
  const threshold = size / 2;
  if (absDelta < threshold) return 0;
  const steps = Math.floor((absDelta - threshold) / size) + 1;
  return Math.sign(delta) * steps;
};

export const snapToPixel = (value: number, pixelRatio: number) => {
  'worklet';
  return Math.round(value * pixelRatio) / pixelRatio;
};

export const snapToPixelFloor = (value: number, pixelRatio: number) => {
  'worklet';
  return Math.floor(value * pixelRatio) / pixelRatio;
};

export const applyFocalShift = (focal: number, translate: number, scaleFactor: number) => {
  'worklet';
  return focal - (focal - translate) * scaleFactor;
};
