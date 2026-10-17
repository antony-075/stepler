export type {
  GuestPageModel,
  GuestTemplate,
  GuestView,
  TemplateActions,
  TemplateImage,
  TemplateLayoutProps,
  TemplateSlots,
} from './model.ts';
export { VIEW_REGION_ID, VIEW_TAB_ID, viewRegionProps } from './model.ts';
export { TEMPLATES } from './registry.ts';
export { GuestTemplateRoot } from './root.tsx';
export { templateSurfaceProps, type TemplateSurfaceProps } from './theme.ts';
export { GuestTemplateScreen, type TemplateScreen, type TemplateStatusIcon } from './screen.tsx';
export { classic } from '../templates/classic/index.ts';
