import { BuildingVisualType } from './types';

export type VisualSpec = {
  obj: string;
  mtl: string;
  resourcePath: string;
  scale: number;
  defaultRotY: number;
};

const industrial = (key: string): VisualSpec => ({
  obj: `/industrial/${key}.obj`,
  mtl: `/industrial/${key}.mtl`,
  resourcePath: '/industrial/',
  scale: 1,
  defaultRotY: 0,
});

const commercial = (key: string): VisualSpec => ({
  obj: `/commercial/${key}.obj`,
  mtl: `/commercial/${key}.mtl`,
  resourcePath: '/commercial/',
  scale: 1,
  defaultRotY: 0,
});

export function visualFor(type: BuildingVisualType): VisualSpec {
  // All your Kenney packs share the same colormap; these picks are placeholders
  // that feel “gamey” and can be swapped later without touching simulation.
  switch (type) {
    case 'Hospital':
      return commercial('building-h');
    case 'Factory':
      return industrial('building-t');
    case 'RetailShop':
      return commercial('building-b');
    case 'Skyscraper':
      return commercial('building-skyscraper-a');
    case 'PostBuilding':
      return commercial('building-d');
    case 'Bank':
      return commercial('building-k');
    case 'Arcade':
      return commercial('building-f');
    case 'Office':
      return industrial('building-n');
    case 'ETF':
      return industrial('detail-tank'); // “bundle” icon vibe; replace later with a dedicated prop
  }
}

export const roadVisuals = {
  straight: {
    obj: '/roads/road-straight.obj',
    mtl: '/roads/road-straight.mtl',
    resourcePath: '/roads/',
    // road-straight is modeled 90° off from our grid axes
    xAxisRotY: Math.PI / 2,
    zAxisRotY: 0,
  },
  cross: {
    obj: '/roads/road-crossroad.obj',
    mtl: '/roads/road-crossroad.mtl',
    resourcePath: '/roads/',
  },
} as const;

