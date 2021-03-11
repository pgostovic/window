import React, { FC } from 'react';

import { Scroller } from '../src';

const rows: string[][] = [];

for (let r = 0; r < 1000; r++) {
  const row: string[] = [];
  for (let c = 0; c < 1000; c++) {
    row.push(`${c}-${r}`);
  }
  rows.push(row);
}

export const BasicGrid: FC = () => (
  <>
    <Scroller
      style={{ height: '500px' }}
      rows={rows}
      stickyRows={[0, 3, 10]}
      stickyCols={[5, 10, 15]}
    />
  </>
);
