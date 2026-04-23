import type {
  AnimationMode,
  AnimationZoomEasing,
  FlashTransitionMode,
  SlideTransitionEasing,
  TransitionMode,
} from '@/app/models/ImageClass'

export interface TransformParams {
  ctx: CanvasRenderingContext2D;
  animation: AnimationMode;
  transition: TransitionMode;
  progress: number;
  imgEl: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  x: number;
  y: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  zoomIntensity: number;
  zoomDistanceIntensity: number;
  itemDuration?: number;
  animationDuration?: number;
  animationZoomEasing?: AnimationZoomEasing;
  elapsedTime: number;
  prevEl?: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  prevAnimation?: AnimationMode;
  prevAnimationProgress?: number;
  prevElapsedTime?: number;
  prevZoomIntensity?: number;
  prevZoomDistanceIntensity?: number;
  prevItemDuration?: number;
  prevAnimationDuration?: number;
  prevParams?: {
    x: number;
    y: number;
    w: number;
    h: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  };
  transitionColor?: string;
  transitionFlashMode?: FlashTransitionMode;
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom';
  transitionAxis?: 'horizontal' | 'vertical';
  transitionSlideEasing?: SlideTransitionEasing;
  transitionCircleEasing?: SlideTransitionEasing;
}
