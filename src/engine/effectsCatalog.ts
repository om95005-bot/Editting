import type { EffectDefinition, EffectInstance } from '../types/editor';

export const EFFECTS_CATALOG: EffectDefinition[] = [
  // ================= COLOR & ADJUSTMENT =================
  {
    id: 'brightness',
    name: 'Brightness',
    category: 'color',
    description: 'Linear luminance lift and offset',
    params: [{ key: 'amount', label: 'Brightness', min: -100, max: 100, step: 1, defaultValue: 18 }],
  },
  {
    id: 'contrast',
    name: 'Contrast',
    category: 'color',
    description: 'Midtone slope expansion and compression',
    params: [{ key: 'amount', label: 'Contrast', min: -100, max: 100, step: 1, defaultValue: 22 }],
  },
  {
    id: 'exposure',
    name: 'Exposure',
    category: 'color',
    description: 'Photographic EV stop gain adjustment',
    params: [{ key: 'ev', label: 'EV Stops', min: -2.5, max: 2.5, step: 0.05, defaultValue: 0.35, unit: 'EV' }],
  },
  {
    id: 'saturation',
    name: 'Saturation',
    category: 'color',
    description: 'Uniform chroma intensity scaling',
    params: [{ key: 'amount', label: 'Saturation', min: -100, max: 100, step: 1, defaultValue: 25 }],
  },
  {
    id: 'vibrance',
    name: 'Vibrance',
    category: 'color',
    description: 'Smart muted-color boost protecting skin tones',
    params: [{ key: 'amount', label: 'Vibrance', min: -100, max: 100, step: 1, defaultValue: 30 }],
  },
  {
    id: 'temperature',
    name: 'Temperature',
    category: 'color',
    description: 'Warm gold to cool tungsten white balance',
    params: [{ key: 'kelvin', label: 'Warmth', min: -100, max: 100, step: 1, defaultValue: 18 }],
  },
  {
    id: 'tint',
    name: 'Tint',
    category: 'color',
    description: 'Green to magenta color axis shift',
    params: [{ key: 'amount', label: 'Tint', min: -100, max: 100, step: 1, defaultValue: 10 }],
  },
  {
    id: 'highlights',
    name: 'Highlights',
    category: 'color',
    description: 'Targeted recovery or lift in bright tones',
    params: [{ key: 'amount', label: 'Highlights', min: -100, max: 100, step: 1, defaultValue: -20 }],
  },
  {
    id: 'shadows',
    name: 'Shadows',
    category: 'color',
    description: 'Selective shadow fill or crush',
    params: [{ key: 'amount', label: 'Shadows', min: -100, max: 100, step: 1, defaultValue: 20 }],
  },
  {
    id: 'rgbAdjust',
    name: 'RGB Adjustment',
    category: 'color',
    description: 'Independent Red, Green, Blue channel gains',
    params: [
      { key: 'red', label: 'Red', min: -100, max: 100, step: 1, defaultValue: 12 },
      { key: 'green', label: 'Green', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'blue', label: 'Blue', min: -100, max: 100, step: 1, defaultValue: -10 },
    ],
  },
  {
    id: 'hslAdjust',
    name: 'HSL Adjustment',
    category: 'color',
    description: 'Hue rotation, saturation, and lightness shift',
    params: [
      { key: 'hue', label: 'Hue Shift', min: -180, max: 180, step: 1, defaultValue: 15, unit: '°' },
      { key: 'sat', label: 'Saturation', min: -100, max: 100, step: 1, defaultValue: 15 },
      { key: 'light', label: 'Lightness', min: -50, max: 50, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: 'colorCurves',
    name: 'Color Curves',
    category: 'color',
    description: 'S-curve tonal sculpting for shadows, midtones, highlights',
    params: [
      { key: 'blacks', label: 'Blacks', min: -50, max: 50, step: 1, defaultValue: -8 },
      { key: 'midtones', label: 'Midtones', min: -50, max: 50, step: 1, defaultValue: 6 },
      { key: 'whites', label: 'Whites', min: -50, max: 50, step: 1, defaultValue: 12 },
    ],
  },
  {
    id: 'colorGrading',
    name: 'Color Grading',
    category: 'color',
    description: 'Split-tone cinema grade for shadows and highlights',
    params: [
      { key: 'shadowHue', label: 'Shadow Hue', min: 0, max: 360, step: 1, defaultValue: 215, unit: '°' },
      { key: 'highlightHue', label: 'Highlight Hue', min: 0, max: 360, step: 1, defaultValue: 42, unit: '°' },
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 40, unit: '%' },
    ],
  },
  {
    id: 'lutApply',
    name: 'LUT Grade (.cube)',
    category: 'color',
    description: 'Apply built-in film LUT or imported .cube 3D LUT',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 100, step: 1, defaultValue: 80, unit: '%' },
      { key: 'preset', label: 'Film Stock', min: 0, max: 4, step: 1, defaultValue: 0 },
    ],
  },

  // ================= BLUR & DISTORTION =================
  {
    id: 'gaussianBlur',
    name: 'Gaussian Blur',
    category: 'blur',
    description: 'Smooth isotropic optical Gaussian blur',
    params: [{ key: 'radius', label: 'Radius', min: 0, max: 24, step: 0.5, defaultValue: 4, unit: 'px' }],
  },
  {
    id: 'motionBlur',
    name: 'Motion Blur',
    category: 'blur',
    description: 'Shutter-angle smear along motion trajectory',
    params: [
      { key: 'strength', label: 'Shutter', min: 0, max: 100, step: 1, defaultValue: 45, unit: '%' },
      { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, defaultValue: 0, unit: '°' },
    ],
  },
  {
    id: 'directionalBlur',
    name: 'Directional Blur',
    category: 'blur',
    description: 'Linear streak blur at custom axis angle',
    params: [
      { key: 'distance', label: 'Distance', min: 1, max: 30, step: 1, defaultValue: 10, unit: 'px' },
      { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, defaultValue: 45, unit: '°' },
    ],
  },
  {
    id: 'radialBlur',
    name: 'Radial Blur',
    category: 'blur',
    description: 'Rotational spin blur around focal center',
    params: [{ key: 'amount', label: 'Spin Amount', min: 0, max: 100, step: 1, defaultValue: 35, unit: '%' }],
  },
  {
    id: 'zoomBlur',
    name: 'Zoom Blur',
    category: 'blur',
    description: 'High-impact radial zoom streaks toward center',
    params: [{ key: 'strength', label: 'Strength', min: 0, max: 100, step: 1, defaultValue: 40, unit: '%' }],
  },
  {
    id: 'lensBlur',
    name: 'Lens Blur',
    category: 'blur',
    description: 'Shallow depth-of-field tilt bokeh falloff',
    params: [
      { key: 'radius', label: 'Aperture', min: 1, max: 20, step: 0.5, defaultValue: 6, unit: 'px' },
      { key: 'focusY', label: 'Focus Band', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' },
    ],
  },
  {
    id: 'glitch',
    name: 'Glitch',
    category: 'blur',
    description: 'Digital horizontal slice shift & RGB channel tear',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 45, unit: '%' },
      { key: 'speed', label: 'Frequency', min: 1, max: 20, step: 1, defaultValue: 8 },
    ],
  },
  {
    id: 'waveDistortion',
    name: 'Wave Distortion',
    category: 'blur',
    description: 'Animated sinusoidal horizontal/vertical warp',
    params: [
      { key: 'amplitude', label: 'Amplitude', min: 0, max: 40, step: 1, defaultValue: 12, unit: 'px' },
      { key: 'frequency', label: 'Frequency', min: 1, max: 25, step: 0.5, defaultValue: 6 },
    ],
  },
  {
    id: 'ripple',
    name: 'Ripple',
    category: 'blur',
    description: 'Concentric shockwave distortion from center',
    params: [
      { key: 'amplitude', label: 'Amplitude', min: 0, max: 35, step: 1, defaultValue: 12, unit: 'px' },
      { key: 'wavelength', label: 'Waves', min: 2, max: 30, step: 1, defaultValue: 10 },
    ],
  },
  {
    id: 'chromaticAberration',
    name: 'Chromatic Aberration',
    category: 'blur',
    description: 'Optical lens red/blue channel dispersion',
    params: [{ key: 'offset', label: 'Dispersion', min: 0, max: 25, step: 0.5, defaultValue: 6, unit: 'px' }],
  },
  {
    id: 'pixelate',
    name: 'Pixelate',
    category: 'blur',
    description: 'Crisp mosaic block quantization',
    params: [{ key: 'size', label: 'Block Size', min: 2, max: 48, step: 1, defaultValue: 10, unit: 'px' }],
  },
  {
    id: 'displacement',
    name: 'Displacement',
    category: 'blur',
    description: 'Procedural turbulence map pixel displacement',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 40, step: 1, defaultValue: 14, unit: 'px' },
      { key: 'scale', label: 'Turbulence', min: 1, max: 20, step: 1, defaultValue: 7 },
    ],
  },

  // ================= MOTION GRAPHICS =================
  {
    id: 'cameraShake',
    name: 'Camera Shake',
    category: 'motion',
    description: 'Handheld micro-jitter & rotational impulse',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 35, unit: '%' },
      { key: 'frequency', label: 'Speed', min: 1, max: 30, step: 1, defaultValue: 12 },
    ],
  },
  {
    id: 'zoomPulse',
    name: 'Zoom',
    category: 'motion',
    description: 'Dynamic rhythmic punch-in zoom',
    params: [
      { key: 'amount', label: 'Zoom Depth', min: 0, max: 100, step: 1, defaultValue: 28, unit: '%' },
      { key: 'rate', label: 'Cycle Rate', min: 0.5, max: 8, step: 0.25, defaultValue: 2 },
    ],
  },
  {
    id: 'rotationSpin',
    name: 'Rotation',
    category: 'motion',
    description: 'Continuous or oscillating roll rotation',
    params: [
      { key: 'angle', label: 'Sweep', min: -180, max: 180, step: 1, defaultValue: 18, unit: '°' },
      { key: 'speed', label: 'Speed', min: 0.2, max: 6, step: 0.2, defaultValue: 1.5 },
    ],
  },
  {
    id: 'motionTrails',
    name: 'Motion Trails',
    category: 'motion',
    description: 'Echoed multi-exposure ghosting streaks',
    params: [
      { key: 'decay', label: 'Trail Length', min: 10, max: 90, step: 1, defaultValue: 55, unit: '%' },
      { key: 'copies', label: 'Echoes', min: 2, max: 6, step: 1, defaultValue: 4 },
    ],
  },
  {
    id: 'glow',
    name: 'Glow',
    category: 'motion',
    description: 'Luminous highlight bloom with threshold control',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 55, unit: '%' },
      { key: 'radius', label: 'Radius', min: 2, max: 32, step: 1, defaultValue: 12, unit: 'px' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 240, step: 5, defaultValue: 150 },
    ],
  },
  {
    id: 'lightLeaks',
    name: 'Light Leaks',
    category: 'motion',
    description: 'Warm analog amber & gold film flare sweep',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' },
      { key: 'speed', label: 'Drift Speed', min: 0.2, max: 5, step: 0.2, defaultValue: 1.2 },
    ],
  },
  {
    id: 'velocityFx',
    name: 'Velocity Effects',
    category: 'motion',
    description: 'Edge vignette pulse + shutter stretch synced to speed',
    params: [{ key: 'intensity', label: 'Impact', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' }],
  },
  {
    id: 'particles',
    name: 'Particle Effects',
    category: 'motion',
    description: 'Procedural floating metallic gold dust & embers',
    params: [
      { key: 'density', label: 'Density', min: 10, max: 120, step: 5, defaultValue: 45 },
      { key: 'size', label: 'Particle Size', min: 1, max: 8, step: 0.5, defaultValue: 3 },
    ],
  },
  {
    id: 'flash',
    name: 'Flash',
    category: 'motion',
    description: 'Strobe exposure flash on beat or interval',
    params: [
      { key: 'intensity', label: 'Flash Power', min: 0, max: 100, step: 1, defaultValue: 65, unit: '%' },
      { key: 'rate', label: 'Rate', min: 0.5, max: 8, step: 0.5, defaultValue: 2 },
    ],
  },
  {
    id: 'smoothZoom',
    name: 'Smooth Zoom',
    category: 'motion',
    description: 'Cinematic Ken Burns ease-in/out push',
    params: [{ key: 'scale', label: 'End Zoom', min: 1, max: 2.2, step: 0.05, defaultValue: 1.28, unit: 'x' }],
  },
  {
    id: 'transform3D',
    name: '3D Transform Effects',
    category: 'motion',
    description: 'Simulated 3D perspective tilt X/Y camera card',
    params: [
      { key: 'tiltX', label: 'Tilt X', min: -45, max: 45, step: 1, defaultValue: 14, unit: '°' },
      { key: 'tiltY', label: 'Tilt Y', min: -45, max: 45, step: 1, defaultValue: -10, unit: '°' },
    ],
  },

  // ================= SHARPENING & STRUCTURE ENGINE =================
  {
    id: 'sharpen',
    name: 'Sharpen',
    category: 'sharpen',
    description: 'Precision luminance convolution sharpening',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 38, unit: '%' },
      { key: 'threshold', label: 'Noise Floor', min: 0, max: 30, step: 1, defaultValue: 4 },
    ],
  },
  {
    id: 'unsharpMask',
    name: 'Unsharp Mask',
    category: 'sharpen',
    description: 'Classic optical unsharp mask with radius & threshold',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 200, step: 2, defaultValue: 85, unit: '%' },
      { key: 'radius', label: 'Radius', min: 1, max: 6, step: 1, defaultValue: 2, unit: 'px' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 40, step: 1, defaultValue: 6 },
    ],
  },
  {
    id: 'smartSharpen',
    name: 'Smart Sharpen',
    category: 'sharpen',
    description: 'Halo-clamped adaptive edge sharpening without ringing',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 150, step: 2, defaultValue: 75, unit: '%' },
      { key: 'radius', label: 'Radius', min: 1, max: 5, step: 1, defaultValue: 2, unit: 'px' },
      { key: 'haloSuppress', label: 'Halo Suppress', min: 0, max: 100, step: 1, defaultValue: 70, unit: '%' },
    ],
  },
  {
    id: 'structure',
    name: 'Structure',
    category: 'sharpen',
    description: 'Mid-frequency micro-contrast & architectural pop',
    params: [
      { key: 'strength', label: 'Structure', min: -50, max: 100, step: 1, defaultValue: 42, unit: '%' },
      { key: 'detail', label: 'Detail Scale', min: 1, max: 6, step: 1, defaultValue: 3 },
    ],
  },
  {
    id: 'clarity',
    name: 'Clarity',
    category: 'sharpen',
    description: 'Broad midtone local contrast enhancement',
    params: [
      { key: 'amount', label: 'Clarity', min: -100, max: 100, step: 1, defaultValue: 35, unit: '%' },
      { key: 'radius', label: 'Spread', min: 2, max: 8, step: 1, defaultValue: 5 },
    ],
  },
  {
    id: 'texture',
    name: 'Texture',
    category: 'sharpen',
    description: 'Fine surface grain accentuation without harsh edges',
    params: [{ key: 'amount', label: 'Texture', min: -100, max: 100, step: 1, defaultValue: 35, unit: '%' }],
  },
  {
    id: 'detailEnhancement',
    name: 'Detail Enhancement',
    category: 'sharpen',
    description: 'Multi-scale luminance detail recovery',
    params: [
      { key: 'detail', label: 'Detail', min: 0, max: 100, step: 1, defaultValue: 48, unit: '%' },
      { key: 'threshold', label: 'Protection', min: 0, max: 35, step: 1, defaultValue: 5 },
    ],
  },
  {
    id: 'edgeEnhancement',
    name: 'Edge Enhancement',
    category: 'sharpen',
    description: 'Sobel-guided contour crispness without flat-area noise',
    params: [
      { key: 'strength', label: 'Edge Gain', min: 0, max: 100, step: 1, defaultValue: 45, unit: '%' },
      { key: 'threshold', label: 'Edge Thresh', min: 4, max: 50, step: 1, defaultValue: 14 },
    ],
  },
  {
    id: 'localContrast',
    name: 'Local Contrast',
    category: 'sharpen',
    description: 'Wide-radius tonal separation for cinematic depth',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 100, step: 1, defaultValue: 38, unit: '%' },
      { key: 'radius', label: 'Radius', min: 3, max: 10, step: 1, defaultValue: 6 },
    ],
  },
  {
    id: 'fineDetailRecovery',
    name: 'Fine Detail Recovery',
    category: 'sharpen',
    description: 'Restores subtle 1px high-frequency detail in soft footage',
    params: [
      { key: 'amount', label: 'Recovery', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' },
      { key: 'threshold', label: 'Noise Gate', min: 2, max: 25, step: 1, defaultValue: 6 },
    ],
  },
  {
    id: 'noiseReduction',
    name: 'Noise Reduction',
    category: 'sharpen',
    description: 'Edge-preserving bilateral smoothing for low-light grain',
    params: [
      { key: 'strength', label: 'Strength', min: 0, max: 100, step: 1, defaultValue: 45, unit: '%' },
      { key: 'preserveEdge', label: 'Edge Guard', min: 10, max: 100, step: 1, defaultValue: 65, unit: '%' },
    ],
  },
  {
    id: 'denoising',
    name: 'Denoising',
    category: 'sharpen',
    description: 'Chroma & luminance speckle suppression',
    params: [{ key: 'strength', label: 'Denoise', min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' }],
  },
  {
    id: 'selectiveSharpening',
    name: 'Selective Sharpening',
    category: 'sharpen',
    description: 'Luminance-masked sharpening focusing on midtones only',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 150, step: 2, defaultValue: 70, unit: '%' },
      { key: 'shadowProtect', label: 'Shadow Guard', min: 0, max: 100, step: 1, defaultValue: 60, unit: '%' },
      { key: 'highlightProtect', label: 'Highlight Guard', min: 0, max: 100, step: 1, defaultValue: 55, unit: '%' },
    ],
  },

  // ================= GENERATIVE & STYLIZE SHADER EFFECTS =================
  {
    id: 'waveWarp',
    name: 'Wave Warp',
    category: 'stylize',
    description: 'Directional sinusoidal wave displacement with angle & phase',
    params: [
      { key: 'magnitude', label: 'Magnitude', min: 0, max: 45, step: 1, defaultValue: 16, unit: 'px' },
      { key: 'spacing', label: 'Spacing', min: 1, max: 20, step: 0.5, defaultValue: 5 },
      { key: 'angle', label: 'Angle', min: 0, max: 360, step: 5, defaultValue: 25, unit: '°' },
      { key: 'phase', label: 'Phase', min: 0, max: 6.28, step: 0.1, defaultValue: 0 },
    ],
  },
  {
    id: 'twirl',
    name: 'Twirl',
    category: 'stylize',
    description: 'Vortex spiral twist around frame center',
    params: [
      { key: 'angle', label: 'Twirl Angle', min: -360, max: 360, step: 5, defaultValue: 135, unit: '°' },
      { key: 'radius', label: 'Radius', min: 10, max: 100, step: 2, defaultValue: 65, unit: '%' },
    ],
  },
  {
    id: 'bulge',
    name: 'Bulge',
    category: 'stylize',
    description: 'Spherical optical bulge or pinch lens distortion',
    params: [
      { key: 'strength', label: 'Strength', min: -100, max: 100, step: 2, defaultValue: 48, unit: '%' },
      { key: 'radius', label: 'Radius', min: 15, max: 100, step: 2, defaultValue: 62, unit: '%' },
    ],
  },
  {
    id: 'mirror',
    name: 'Mirror',
    category: 'stylize',
    description: 'Symmetrical horizontal, vertical, or quad frame reflection',
    params: [
      { key: 'mode', label: 'Axis (0:H 1:V 2:Quad)', min: 0, max: 2, step: 1, defaultValue: 0 },
      { key: 'offset', label: 'Center Offset', min: -40, max: 40, step: 1, defaultValue: 0, unit: '%' },
    ],
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    category: 'stylize',
    description: 'Multi-segment radial prism symmetry shader',
    params: [
      { key: 'segments', label: 'Segments', min: 3, max: 16, step: 1, defaultValue: 6 },
      { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 2, defaultValue: 15, unit: '°' },
    ],
  },
  {
    id: 'tile',
    name: 'Tile',
    category: 'stylize',
    description: 'Seamless grid repetition with optional mirror tiling',
    params: [
      { key: 'count', label: 'Grid Count', min: 1, max: 6, step: 1, defaultValue: 2 },
      { key: 'mirrorEdge', label: 'Mirror (0/1)', min: 0, max: 1, step: 1, defaultValue: 1 },
    ],
  },
  {
    id: 'halftone',
    name: 'Halftone',
    category: 'stylize',
    description: 'Graphic print luminance dot-screen pattern',
    params: [
      { key: 'dotSize', label: 'Dot Pitch', min: 3, max: 16, step: 1, defaultValue: 6, unit: 'px' },
      { key: 'contrast', label: 'Contrast', min: 50, max: 200, step: 5, defaultValue: 115, unit: '%' },
    ],
  },
  {
    id: 'mosaic',
    name: 'Mosaic',
    category: 'stylize',
    description: 'Beveled tile mosaic blocks with dark grout lines',
    params: [
      { key: 'cellSize', label: 'Tile Size', min: 4, max: 32, step: 1, defaultValue: 12, unit: 'px' },
      { key: 'grout', label: 'Grout Darkness', min: 0, max: 100, step: 5, defaultValue: 55, unit: '%' },
    ],
  },
  {
    id: 'posterize',
    name: 'Posterize',
    category: 'stylize',
    description: 'Color tone quantization into graphic bands',
    params: [
      { key: 'levels', label: 'Tone Levels', min: 2, max: 16, step: 1, defaultValue: 5 },
    ],
  },
  {
    id: 'emboss',
    name: 'Emboss',
    category: 'stylize',
    description: 'Directional metallic relief surface bevel',
    params: [
      { key: 'strength', label: 'Relief Depth', min: 0, max: 100, step: 2, defaultValue: 65, unit: '%' },
      { key: 'mix', label: 'Color Mix', min: 0, max: 100, step: 2, defaultValue: 45, unit: '%' },
    ],
  },
  {
    id: 'outline',
    name: 'Outline',
    category: 'stylize',
    description: 'Sobel edge-detected luminous contour outline',
    params: [
      { key: 'threshold', label: 'Sensitivity', min: 10, max: 140, step: 2, defaultValue: 42 },
      { key: 'mix', label: 'Overlay Mix', min: 0, max: 100, step: 2, defaultValue: 80, unit: '%' },
      { key: 'goldTint', label: 'Gold Accent', min: 0, max: 100, step: 5, defaultValue: 85, unit: '%' },
    ],
  },
  {
    id: 'noise',
    name: 'Noise',
    category: 'stylize',
    description: 'Organic film grain and procedural luminance noise',
    params: [
      { key: 'amount', label: 'Grain Amount', min: 0, max: 100, step: 1, defaultValue: 32, unit: '%' },
      { key: 'monochrome', label: 'Mono (0/1)', min: 0, max: 1, step: 1, defaultValue: 1 },
    ],
  },
  {
    id: 'gradientOverlay',
    name: 'Gradient',
    category: 'stylize',
    description: 'Procedural two-tone directional gradient tint overlay',
    params: [
      { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 2, defaultValue: 45, unit: '%' },
      { key: 'angle', label: 'Angle', min: 0, max: 360, step: 5, defaultValue: 135, unit: '°' },
      { key: 'hueA', label: 'Color A Hue', min: 0, max: 360, step: 5, defaultValue: 44, unit: '°' },
      { key: 'hueB', label: 'Color B Hue', min: 0, max: 360, step: 5, defaultValue: 220, unit: '°' },
    ],
  },
  {
    id: 'echo',
    name: 'Echo',
    category: 'stylize',
    description: 'Multi-offset geometric echo clones with decay',
    params: [
      { key: 'copies', label: 'Echo Copies', min: 2, max: 7, step: 1, defaultValue: 4 },
      { key: 'spread', label: 'Spread', min: 4, max: 40, step: 1, defaultValue: 14, unit: 'px' },
      { key: 'decay', label: 'Decay', min: 15, max: 90, step: 2, defaultValue: 62, unit: '%' },
    ],
  },
  {
    id: 'trails',
    name: 'Trails',
    category: 'stylize',
    description: 'Luminous directional light streak trails',
    params: [
      { key: 'length', label: 'Trail Length', min: 2, max: 14, step: 1, defaultValue: 7 },
      { key: 'intensity', label: 'Intensity', min: 10, max: 100, step: 2, defaultValue: 60, unit: '%' },
      { key: 'angle', label: 'Direction', min: 0, max: 360, step: 5, defaultValue: 15, unit: '°' },
    ],
  },
];

export const LUT_PRESET_NAMES = [
  'Gold Noir (Cinema)',
  'Teal & Amber',
  'Fuji Crisp 400',
  'Bleach Bypass',
  'Obsidian Monochrome',
];

export function createEffectInstance(effectId: string): EffectInstance {
  const def = EFFECTS_CATALOG.find((e) => e.id === effectId);
  if (!def) {
    throw new Error(`Unknown effect ID: ${effectId}`);
  }
  const params: Record<string, number> = {};
  for (const p of def.params) {
    params[p.key] = p.defaultValue;
  }
  return {
    instanceId: `fx_${effectId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    effectId: def.id,
    name: def.name,
    category: def.category,
    enabled: true,
    params,
  };
}

export function buildInstancesFromCustomEffect(customFx: {
  id: string;
  name: string;
  layers: { effectId: string; params: Record<string, number>; exposedParamKeys: string[] }[];
}): EffectInstance[] {
  return customFx.layers.map((layer, idx) => {
    const base = createEffectInstance(layer.effectId);
    return {
      ...base,
      instanceId: `fx_cust_${customFx.id}_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      params: { ...base.params, ...layer.params },
      customEffectId: customFx.id,
      customEffectName: customFx.name,
      exposedParams: [...layer.exposedParamKeys],
    };
  });
}

/**
 * Parses a standard Adobe .cube 3D LUT file into a flattened RGB float array.
 */
export function parseCubeLut(cubeText: string): { size: number; data: number[]; title: string } {
  const lines = cubeText.split(/\r?\n/);
  let size = 0;
  let title = 'Custom LUT';
  const data: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) {
      title = line.replace(/^TITLE\s*/, '').replace(/^"|"$/g, '') || title;
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1] || '0', 10);
      continue;
    }
    if (/^[A-Z_]/.test(line)) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
      data.push(parts[0], parts[1], parts[2]);
    }
  }

  if (size < 2 || data.length < size * size * size * 3) {
    throw new Error('Invalid .cube 3D LUT file format');
  }

  return { size, data, title };
}
