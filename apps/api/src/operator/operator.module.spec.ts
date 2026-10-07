import { expect, test } from 'vitest';
import { CollectionsModule } from '../collections/collections.module.js';
import { ContentModule } from '../content/content.module.js';
import { GuestAccessModule } from '../guest-access/guest-access.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { OperatorModule } from './operator.module.js';

// The extraction seam (plan "Console architecture"): the operator module and the moderation use
// cases it takes reach no admin or guest controller module.
test('the operator module imports no user-app controller module', () => {
  for (const module of [OperatorModule, ModerationModule]) {
    const imports = (Reflect.getMetadata('imports', module) ?? []) as unknown[];
    for (const forbidden of [CollectionsModule, GuestAccessModule, ContentModule]) {
      expect(imports).not.toContain(forbidden);
    }
  }
});
