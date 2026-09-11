/**
 * @file plugins/catalog/index.ts
 * @description The Component Catalog plugin: a live gallery of the form-kit
 * and list-kit components, shown as its own activity-bar view.
 *
 * A design-review surface, not a feature. It owns no app state and talks to
 * no worker, which also makes it the smallest possible exercise of the pane
 * contribution lane.
 *
 * Developer builds only (`devOnly`). The catalog is where a new kit component
 * is added and reviewed, so shipping it would put an internal tool in front
 * of users; `docs/migration/ui-style-guide.md` states the same rule from the
 * UI side.
 *
 * Off until asked for (`defaultEnabled: false`), so even a developer build
 * opens on the three real views and the gallery is one switch away in
 * Settings > Plugins.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import { CatalogPane1 } from './renderer/CatalogPane1'
import { CatalogPane2 } from './renderer/CatalogPane2'
import { CatalogPane3 } from './renderer/CatalogPane3'

export const catalogPlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: 'catalog',
    name: 'Component Catalog',
    version: '1.0.0',
    description: 'Live gallery of the h3-kit form, list and property components.',
    devOnly: true,
    defaultEnabled: false,
    contributes: {
      views: [
        {
          id: 'catalog',
          title: 'Component Catalog',
          icon: 'activity.catalog',
          panes: [
            { id: 'catalog1', defaultSize: 280 },
            { id: 'catalog2', defaultSize: 280 },
            { id: 'catalog3', defaultSize: 280 },
          ],
        },
      ],
    },
  },
  panes: {
    catalog1: CatalogPane1,
    catalog2: CatalogPane2,
    catalog3: CatalogPane3,
  },
})
