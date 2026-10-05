import { describe, expect, it } from 'vitest';
import {
  acceptPreviewMessage,
  isPreviewReady,
  PREVIEW_READY,
  previewMessage,
} from './preview-protocol';

const ORIGIN = 'https://app.stepler.test';
const parent = {} as MessageEventSource;
const other = {} as MessageEventSource;
const page = {
  templateId: 'classic',
  templateVersion: 1,
  settings: {
    background: { kind: 'solid', color: '#F0F1EE' },
    accent: '#5A4A8C',
    headingFont: 'geologica',
    coverPlacement: 'top',
    align: 'start',
    corners: 'soft',
  },
  welcomeMessage: null,
  cover: null,
  background: null,
  updatedAt: '2026-10-05T10:00:00.000Z',
} as const;

describe('acceptPreviewMessage', () => {
  const event = (
    overrides: Partial<{ origin: string; source: MessageEventSource; data: unknown }>,
  ) => ({
    origin: ORIGIN,
    source: parent,
    data: previewMessage(page),
    ...overrides,
  });

  it('a message from another origin is ignored', () => {
    expect(
      acceptPreviewMessage(event({ origin: 'https://evil.example' }), parent, ORIGIN),
    ).toBeNull();
  });

  it('the right origin but another window is ignored', () => {
    expect(acceptPreviewMessage(event({ source: other }), parent, ORIGIN)).toBeNull();
    expect(acceptPreviewMessage(event({}), null, ORIGIN)).toBeNull();
  });

  it('a malformed page or an unknown type is ignored', () => {
    const bad = { ...previewMessage(page), page: { ...page, settings: { accent: 'red' } } };
    expect(acceptPreviewMessage(event({ data: bad }), parent, ORIGIN)).toBeNull();
    expect(acceptPreviewMessage(event({ data: { type: 'x' } }), parent, ORIGIN)).toBeNull();
    expect(
      acceptPreviewMessage(event({ data: { ...previewMessage(page), extra: 1 } }), parent, ORIGIN),
    ).toBeNull();
  });

  it('a valid message gives the page and the state (the default: mine + others’)', () => {
    expect(acceptPreviewMessage(event({}), parent, ORIGIN)).toEqual({ page, state: 'mixed' });
    expect(
      acceptPreviewMessage(event({ data: previewMessage(page, 'view-only') }), parent, ORIGIN),
    ).toEqual({ page, state: 'view-only' });
  });

  it('an unknown state is ignored', () => {
    const bad = { ...previewMessage(page), state: 'admin' };
    expect(acceptPreviewMessage(event({ data: bad }), parent, ORIGIN)).toBeNull();
  });
});

describe('isPreviewReady', () => {
  it('only the iframe’s own ready message on this origin', () => {
    const ready = { origin: ORIGIN, source: parent, data: { type: PREVIEW_READY } };
    expect(isPreviewReady(ready, parent, ORIGIN)).toBe(true);
    expect(isPreviewReady({ ...ready, source: other }, parent, ORIGIN)).toBe(false);
    expect(isPreviewReady({ ...ready, origin: 'https://evil.example' }, parent, ORIGIN)).toBe(
      false,
    );
  });
});
