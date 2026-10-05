import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  GuestPageEditor,
  GuestPageVersion as GuestPageVersionDto,
  SaveGuestPageDraftRequest,
} from '@stepler/contracts';
import {
  assertReadable,
  ContrastError,
  definitionOf,
  resolveTheme,
  settingsSchemaFor,
} from '@stepler/templates/core';
import type { AccountPrincipal } from '../auth/principal.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import type { GuestPageVersion, Prisma } from '../generated/prisma/client.js';
import { CollectionImagesService } from '../images/collection-images.service.js';
import { IMAGE_SELECT, ImageUrls } from '../images/image-urls.js';
import { JOB_QUEUE, type JobQueue } from '../jobs/job-queue.js';
import { GuestPageRepository } from './guest-page.repository.js';

const conflict = () => new AppError('GUEST_PAGE_DRAFT_CONFLICT', 409);

/**
 * The guest page editor (plan Task 9, ADR 0017): one PUBLISHED version guests see and, while the
 * owner edits, one DRAFT. Saving replaces the draft's template, settings and welcome under
 * optimistic concurrency (`baseRevision` must be the draft's revision; a draft that appeared,
 * moved on or went away meanwhile is `409 GUEST_PAGE_DRAFT_CONFLICT`); publishing copies it over
 * the published version; resetting deletes it. Images change through their own routes and never
 * bump the revision. Every write locks the collection row first (lock order [C9]: owner →
 * collection → draft row), so publishes, resets, saves and image changes of one collection run
 * one at a time, and images nothing references any more are collected in the same transaction.
 */
@Injectable()
export class GuestPageService {
  private readonly logger = new Logger(GuestPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: CollectionImagesService,
    private readonly pages: GuestPageRepository,
    private readonly urls: ImageUrls,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  /** The owner's view: both versions, images signed in one window. Archived collections too. */
  async read(a: AccountPrincipal, collectionId: string): Promise<GuestPageEditor> {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, ownerId: a.userId, status: { not: 'DELETING' } },
      select: { id: true },
    });
    if (collection === null) throw new AppError('NOT_FOUND', 404);
    const { published, draft } = await this.pages.readVersions(this.prisma, collection.id);
    const now = new Date();
    const [publishedDto, draftDto] = await Promise.all([
      this.toDto(published, now),
      draft === null ? null : this.toDto(draft, now),
    ]);
    return {
      published: publishedDto,
      draft: draft === null || draftDto === null ? null : { ...draftDto, revision: draft.revision },
    };
  }

  /**
   * Saves the working copy. The template must exist (else `400` at `templateId`), the settings
   * must be what it allows (else `400` with paths under `settings`), and every text token must
   * read at 4.5:1 (else `422 THEME_CONTRAST_TOO_LOW`, which only a broken definition can cause).
   */
  async saveDraft(
    a: AccountPrincipal,
    collectionId: string,
    body: SaveGuestPageDraftRequest,
  ): Promise<GuestPageEditor> {
    const def = definitionOf(body.templateId);
    if (def === undefined) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: [{ path: ['templateId'], message: 'Unknown template' }],
      });
    }
    const parsed = settingsSchemaFor(def).safeParse(body.settings);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 400, {
        errors: parsed.error.issues.map((issue) => ({
          path: [
            'settings',
            ...issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
          ],
          message: issue.message,
        })),
      });
    }
    try {
      assertReadable(def, parsed.data);
    } catch (error) {
      if (!(error instanceof ContrastError)) throw error;
      this.logger.error({
        msg: 'template contrast too low',
        templateId: def.id,
        token: error.token,
      });
      throw new AppError('THEME_CONTRAST_TOO_LOW', 422);
    }
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.images.lockMutable(tx, a, collectionId);
      let draft = await this.pages.lockDraft(tx, locked.id);
      // A draft made by this save already has a revision of its own (the next one).
      let fresh = false;
      if (draft === null) {
        // A revision named for a draft that is gone (published or reset elsewhere) is stale too.
        if (body.baseRevision !== null) throw conflict();
        draft = await this.pages.ensureDraft(tx, locked.id);
        fresh = true;
      } else if (
        body.baseRevision !== draft.revision &&
        // A draft no save has touched yet (an image change made it) holds only what was
        // published: a first save from "no draft" may take it, nothing is lost.
        !(body.baseRevision === null && draft.savedAt === null)
      ) {
        throw conflict();
      }
      await tx.guestPageVersion.update({
        where: { id: draft.id },
        data: {
          templateId: def.id,
          templateVersion: def.version,
          settings: parsed.data,
          welcomeMessage: body.welcomeMessage,
          revision: fresh ? draft.revision : await this.pages.nextRevision(tx, locked.id),
          savedAt: new Date(),
        },
      });
    });
    return this.read(a, collectionId);
  }

  /**
   * Publishes the draft named by `revision`: its columns replace the published version's, the
   * draft row goes, and the images the old published version referenced that nothing else does
   * are collected; the published version keeps the draft's revision. No draft: `200` as is when
   * `revision` is the published one (a repeated publish), else `409` (a draft published or reset
   * elsewhere). A revision that is not the draft's: `409`.
   */
  async publish(
    a: AccountPrincipal,
    collectionId: string,
    revision: number,
  ): Promise<GuestPageEditor> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.images.lockMutable(tx, a, collectionId);
      const draft = await this.pages.lockDraft(tx, locked.id);
      const published = await this.pages.ensurePublished(tx, locked.id);
      if (draft === null) {
        if (published.revision === revision) return;
        throw conflict();
      }
      if (draft.revision !== revision) throw conflict();
      // The draft row goes first: the published row takes its image references.
      await tx.guestPageVersion.delete({ where: { id: draft.id } });
      await tx.guestPageVersion.update({
        where: { id: published.id },
        data: {
          templateId: draft.templateId,
          templateVersion: draft.templateVersion,
          settings: draft.settings as Prisma.InputJsonValue,
          welcomeMessage: draft.welcomeMessage,
          coverImageId: draft.coverImageId,
          backgroundImageId: draft.backgroundImageId,
          revision: draft.revision,
        },
      });
      await this.images.collectGarbage(tx, locked.id, [
        published.coverImageId,
        published.backgroundImageId,
      ]);
      this.logger.log({
        msg: 'guest page published',
        collectionId: locked.id,
        templateId: draft.templateId,
      });
    });
    return this.read(a, collectionId);
  }

  /** «Скинути зміни»: deletes the draft and collects its images. No draft: no-op. */
  async reset(a: AccountPrincipal, collectionId: string): Promise<void> {
    await this.jobs.ready();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.images.lockMutable(tx, a, collectionId);
      const draft = await this.pages.lockDraft(tx, locked.id);
      if (draft === null) return;
      await tx.guestPageVersion.delete({ where: { id: draft.id } });
      await this.images.collectGarbage(tx, locked.id, [
        draft.coverImageId,
        draft.backgroundImageId,
      ]);
      this.logger.log({ msg: 'guest page draft reset', collectionId: locked.id });
    });
  }

  /**
   * A version as the owner sees it: the template and settings resolved (a removed template or
   * settings it no longer accepts read as the fallback, with a log line), images signed.
   */
  private async toDto(version: GuestPageVersion, now: Date): Promise<GuestPageVersionDto> {
    const resolved = resolveTheme(version.templateId, version.templateVersion, version.settings);
    if (resolved.fellBack) {
      this.logger.warn({
        msg: 'guest page settings fell back',
        collectionId: version.collectionId,
        templateId: version.templateId,
      });
    }
    const ids = [version.coverImageId, version.backgroundImageId].filter(
      (id): id is string => id !== null,
    );
    const rows =
      ids.length === 0
        ? []
        : await this.prisma.collectionImage.findMany({
            where: { id: { in: ids }, collectionId: version.collectionId },
            select: IMAGE_SELECT,
          });
    const byId = (id: string | null) => rows.find((row) => row.id === id) ?? null;
    const [cover, background] = await Promise.all([
      this.urls.forAdmin(byId(version.coverImageId), now),
      this.urls.forAdmin(byId(version.backgroundImageId), now),
    ]);
    return {
      templateId: resolved.def.id,
      templateVersion: resolved.def.version,
      settings: resolved.settings,
      welcomeMessage: version.welcomeMessage,
      cover,
      background,
      updatedAt: version.updatedAt.toISOString(),
    };
  }
}
