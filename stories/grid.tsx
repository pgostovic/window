import React, { FC } from 'react';

import { Scroller } from '../src';

const rows: number[][] = [];
for (let i = 0; i < 100; i++) {
  const cols = [];
  for (let j = 0; j < 10; j++) {
    cols.push([i, j]);
  }
  rows.push(cols);
}

const sizes: number[] = [];
for (let i = 0; i < 1000; i++) {
  sizes.push(20 + Math.round(Math.random() * 50));
}

export const Grid: FC = () => (
  <>
    <Scroller style={{ height: '500px' }} rows={rows}>
      {(cols: number[], i) => (
        <div style={{ borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center' }}>
          <span>{cols.map(col => `(${col})`).join(', ')}</span>
        </div>
      )}
    </Scroller>
  </>
);
