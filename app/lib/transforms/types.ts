import type { AnimationMode, SlideTransitionEasing, TransitionMode } from '@/app/models/ImageClass'

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
  itemDuration?: number;
  animationDuration?: number;
  elapsedTime: number;
  prevEl?: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  prevAnimation?: AnimationMode;
  prevAnimationProgress?: number;
  prevElapsedTime?: number;
  prevZoomIntensity?: number;
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
  transitionDirection?: 'left' | 'right' | 'top' | 'bottom';
  transitionAxis?: 'horizontal' | 'vertical';
  transitionSlideEasing?: SlideTransitionEasing;
  transitionCircleEasing?: SlideTransitionEasing;
}
