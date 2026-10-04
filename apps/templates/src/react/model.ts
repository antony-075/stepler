import type { ThemeSettings } from '@stepler/contracts';
import type { ComponentType, ReactNode } from 'react';
import type { TemplateDefinition } from '../core/definition.js';

/**
 * The contract between apps/web and a template (ADR 0017). The app owns data, state, copy and
 * every interactive widget it already has (frames, uploads, dialogs, the legal notice, the
 * language switch); a template owns only the page around them. Everything here is plain data,
 * so the editor's preview (PR J) can build it without guest endpoints.
 */

/** A picture the template places; presigned, so `onError` lets the app fetch fresh links. */
export type TemplateImage = {
  src: string;
  /** Width descriptors of the renditions (`… 480w, … 1600w`). */
  srcSet: string;
  /** A default; a template that knows its column width passes its own. */
  sizes: string;
  /** The source's upright dimensions: the box never shifts while the picture loads. */
  width: number;
  height: number;
  /** Called on a load error, e.g. an expired link; the app asks for fresh links once. */
  onError?: () => void;
};

export type GuestPageModel = {
  title: string;
  description: string | null;
  welcomeMessage: string | null;
  /** «86 кадрів»; `null` when the link does not show the shared gallery. */
  countsLabel: string | null;
  /** «останній о 21:10», beside the count; `null` when there is none. */
  lastAddedLabel: string | null;
  /** `null` when the admin set none, or the template's placement is `none`. */
  cover: TemplateImage | null;
  /** Only for an image background; `null` otherwise. */
  background: TemplateImage | null;
  /** `contributed` once the guest has a frame here (or added one in this visit). */
  phase: 'first-visit' | 'contributed';
};

/** The guest's actions as data: each template draws its own buttons. */
export type TemplateActions = {
  /**
   * Files (`files`) when the link takes any, else the wish (`text`). `onSelect` must be called
   * synchronously in the click handler: iOS opens the file picker only inside the user's tap.
   */
  primary: { label: string; icon: 'files' | 'text'; onSelect: () => void };
  /** The wish, quieter, when files are the primary action and the link takes texts too. */
  secondary: { label: string; onSelect: () => void } | null;
  /** «Не закривайте сторінку…» while uploads run, else `null`. */
  note: string | null;
};

/** The app's own pieces, placed by the template. */
export type TemplateSlots = {
  /** The wordmark, linking home. */
  brand: ReactNode;
  languageSwitch: ReactNode;
  /** The terms notice (ADR 0016): directly after the actions, wherever they are drawn. */
  legalNotice: ReactNode;
  /** Always rendered, and never covered by a sticky bar. */
  footer: ReactNode;
  /** «Ваші кадри» with its heading; `null` on a view-only link. */
  ownFrames: ReactNode | null;
  /** «Усі кадри» with its heading; `null` when the link hides the shared gallery. */
  allFrames: ReactNode | null;
};

export type TemplateLayoutProps = {
  model: GuestPageModel;
  /** `null` on a view-only link: no buttons, no notice. */
  actions: TemplateActions | null;
  slots: TemplateSlots;
  /** Resolved and valid for `def`. */
  settings: ThemeSettings;
  def: TemplateDefinition;
};

export type GuestTemplate = TemplateDefinition & {
  Layout: ComponentType<TemplateLayoutProps>;
  /** A small decorative picture of the template for the editor's picker. */
  Thumbnail: ComponentType;
  /**
   * PR H only: `classic` is today's guest page, which still follows the visitor's light/dark
   * setting, so the root sets no `color-scheme` of its own. Removed when classic is redesigned.
   */
  followsSystemScheme?: boolean;
};
