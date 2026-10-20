/**
 * Shape dividers of containers: the shapes (Elementor's, drawn in a
 * 1000×100 box) at the top or bottom edge, filled with a color. The
 * "negative" variant fills the other side of the line.
 */
export const SHAPES: Record<string, { label: string; path: string; negative?: string }> = {
  tilt: { label: 'Tilt', path: 'M0,6V0h1000v100L0,6z' },
  triangle: {
    label: 'Triangle',
    path: 'M500,98.9L0,6.1V0h1000v6.1L500,98.9z',
    negative: 'M500.2,94.7L0,0v100h1000V0L500.2,94.7z',
  },
  curve: {
    label: 'Curve',
    path: 'M1000,4.3V0H0v4.3C0.9,23.1,126.7,99.2,500,100S1000,22.7,1000,4.3z',
    negative: 'M500,97C126.7,96.3,0.8,19.8,0,0v100l1000,0V1C1000,19.4,873.3,97.8,500,97z',
  },
  'curve-asymmetrical': {
    label: 'Curve, asymmetrical',
    path: 'M0,0c0,0,0,6,0,6.7c0,18,240.2,93.6,615.2,92.6C989.8,98.5,1000,25,1000,6.7c0-0.7,0-6.7,0-6.7H0z',
    negative: 'M615.2,96.7C240.2,97.8,0,18.9,0,0v100h1000V0C1000,19.2,989.8,96,615.2,96.7z',
  },
  waves: {
    label: 'Waves',
    path: 'M421.9,6.5c22.6-2.5,51.5,0.4,75.5,5.3c23.6,4.9,70.9,23.5,100.5,35.7c75.8,32.2,133.7,44.5,192.6,49.7c23.6,2.1,48.7,3.5,103.4-2.5c54.7-6,106.2-25.6,106.2-25.6V0H0v30.3c0,0,72,32.6,158.4,30.5c39.2-0.7,92.8-6.7,134-22.4c21.2-8.1,52.2-18.2,79.7-24.2C399.3,7.9,411.6,7.5,421.9,6.5z',
  },
};

export const SHAPE_OPTIONS = [
  { value: '', label: 'None' },
  ...Object.entries(SHAPES).map(([value, shape]) => ({ value, label: shape.label })),
];
